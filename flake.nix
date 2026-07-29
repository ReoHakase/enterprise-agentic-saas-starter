{
  description = "enterprise-agentic-saas-starter dev shell";

  # inputs: Nix / skills / MCP の参照元。
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";

    agent-skills-nix = {
      url = "github:Kyure-A/agent-skills-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    mcp-servers-nix = {
      url = "github:natsukium/mcp-servers-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    next-skills = {
      url = "github:vercel-labs/next-skills";
      flake = false;
    };

    emil-skill = {
      url = "github:emilkowalski/skill";
      flake = false;
    };

    mastra-skills = {
      url = "github:mastra-ai/skills";
      flake = false;
    };
  };

  outputs =
    inputs@{
      flake-parts,
      mcp-servers-nix,
      ...
    }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        mcp-servers-nix.flakeModule
      ];

      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-darwin"
        "x86_64-linux"
      ];

      perSystem =
        {
          config,
          lib,
          pkgs,
          ...
        }:
        let
          agentLib = inputs.agent-skills-nix.lib.agent-skills;

          # skills: catalog -> allowlist -> selection。
          selectSkills =
            sources: args:
            let
              catalog = agentLib.discoverCatalog sources;
            in
            agentLib.selectSkills {
              inherit catalog sources;
              skills = { };
              allowlist = agentLib.allowlistFor ({ inherit catalog sources; } // args);
            };

          # skills: repo-local は git 管理する正本から読む。
          # .agents/skills は生成先なので source にしない。
          localSkills =
            selectSkills
              {
                repo = {
                  path = ./.agents/local-skills;
                  filter.maxDepth = 1;
                };
              }
              {
                enableAll = [ "repo" ];
              };

          # skills: external は必要なものだけ allowlist する。
          # upstream に skill が増えても勝手に runtime へ入れない。
          externalSkills =
            selectSkills
              {
                emil = {
                  path = inputs.emil-skill;
                  subdir = "skills";
                  filter.maxDepth = 1;
                };

                next = {
                  path = inputs.next-skills;
                  subdir = "skills";
                  filter.maxDepth = 1;
                };

                mastra = {
                  path = inputs.mastra-skills;
                  subdir = "skills";
                  filter.maxDepth = 1;
                };
              }
              {
                enable = [
                  "emil-design-eng"
                  "mastra"
                  "next-best-practices"
                  "next-cache-components"
                  "next-upgrade"
                ];
              };

          # skills: runtime bundle。衝突時は repo-local を優先する。
          skillsBundle = agentLib.mkBundle {
            inherit pkgs;
            name = "enterprise-agentic-saas-agent-skills";
            selection = externalSkills // localSkills;
          };

          # skills: dev shell 起動時に .agents/skills へ同期する。
          syncSkills = agentLib.mkLocalInstallScript {
            inherit pkgs;
            bundle = skillsBundle;
            targets.agents = agentLib.defaultLocalTargets.agents // {
              enable = true;
            };
          };

          # MCP: bunx は nixpkgs 固定。npm package を固定するなら name@version にする。
          mcpServers = {
            chrome-devtools-mcp = {
              command = "${pkgs.bun}/bin/bunx";
              args = [
                "-y"
                "chrome-devtools-mcp@1.5.0"
              ];
            };

            next-devtools-mcp = {
              command = "${pkgs.bun}/bin/bunx";
              args = [
                "-y"
                "next-devtools-mcp@0.4.0"
              ];
            };

            grafana = {
              command = "${pkgs.mcp-grafana}/bin/mcp-grafana";
              args = [
                "--disable-write"
                "--enabled-tools=datasource,prometheus,loki,proxied"
              ];
              env.GRAFANA_URL = "http://127.0.0.1:3000";
            };
          };

          # MCP: Cursor は Claude Code 互換の stdio type を付ける。
          stdioMcpServers = lib.mapAttrs (_: server: server // { type = "stdio"; }) mcpServers;

          # MCP: module が出せない Codex / Cursor だけ mkConfig で生成する。
          codexMcpConfig = mcp-servers-nix.lib.mkConfig pkgs {
            flavor = "codex";
            format = "toml-inline";
            fileName = ".mcp.toml";
            settings.servers = mcpServers;
          };

          cursorMcpConfig = mcp-servers-nix.lib.mkConfig pkgs {
            flavor = "claude-code";
            fileName = "mcp.json";
            settings.servers = stdioMcpServers;
          };

          # sync-agent-config: 手動実行と dev shell が共用する同期コマンド。
          # AGENT_CONFIG_ROOT で別 worktree や test 用 root にも同期できる。
          syncAgentConfig = pkgs.writeShellApplication {
            name = "sync-agent-config";
            runtimeInputs = [ pkgs.coreutils ];
            text = ''
              set -euo pipefail

              root="''${AGENT_CONFIG_ROOT:-$PWD}"

              AGENT_SKILLS_ROOT="$root" ${syncSkills}/bin/skills-install-local

              (
                cd "$root"
                ${config.mcp-servers.shellHook}
              )

              mkdir -p "$root/.cursor"
              ln -sfn ${lib.escapeShellArg "${codexMcpConfig}"} "$root/.mcp.toml"
              ln -sfn ${lib.escapeShellArg "${cursorMcpConfig}"} "$root/.cursor/mcp.json"

              echo "agent-config: synced skills and MCP config"
            '';
          };

          # dev shell: ローカル開発 CLI と起動時同期。
          devShell = pkgs.mkShell {
            packages = [
              pkgs.bun
              pkgs.turso-cli
              pkgs.sqld
              pkgs.dotenvx
              pkgs.mailpit
              # health/OpenAPI/Worker outputを同じshellで検査する。
              pkgs.curl
              pkgs.jq
            ];

            # Wrangler/OpenNext/Playwright/Storybookはroot catalogで固定し、
            # Bun workspaceから実行する。flake側でversion sourceを重ねない。

            # dev shell: Portless の local CA を Node/Bun 系 tooling に渡す。
            shellHook = ''
              if [ -z "''${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "''${HOME}/.portless/ca.pem" ]; then
                export NODE_EXTRA_CA_CERTS="''${HOME}/.portless/ca.pem"
              fi

              ${syncAgentConfig}/bin/sync-agent-config
            '';
          };
        in
        {
          # MCP: VS Code workspace は mcp-servers-nix module に任せる。
          mcp-servers = {
            addGcRoot = false;
            settings = {
              servers = stdioMcpServers;
              inputs = [ ];
            };
            flavors.vscode-workspace.enable = true;
          };

          devShells.default = devShell;

          apps.sync-agent-config = {
            type = "app";
            program = "${syncAgentConfig}/bin/sync-agent-config";
          };

          packages = {
            agent-skills = skillsBundle;
            agent-config-sync = syncAgentConfig;
          };

          checks = {
            agent-skills = skillsBundle;
            devShell = devShell;
          };
        };
    };
}
