{
  description = "enterprise-agentic-saas-starter dev shell";

  nixConfig = {
    extra-substituters = [ "https://cache.numtide.com" ];
    extra-trusted-public-keys = [ "niks3.numtide.com-1:DTx8wZduET09hRmMtKdQDxNNthLQETkc/yaX7M4qK0g=" ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    llm-agents.url = "github:numtide/llm-agents.nix";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      llm-agents,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config = { };
        };

        # Bun はこの flake の `flake.lock` に固定された nixpkgs の `pkgs.bun` を使う（リリースごとの hash は自前で持たない）。
        # バージョンを揃えたいときは `nix flake lock --update-input nixpkgs` のあと `nix develop -c bun --version` と root `package.json` の `packageManager` / `engines` を照合する。

        apmPkg = llm-agents.packages.${system}.apm;
        devShell = pkgs.mkShell {
          packages = [
            pkgs.bun
            pkgs.turso-cli
            pkgs.sqld
            pkgs.dotenvx
            apmPkg
          ];

          # Portless のローカル CA（`portless trust` 後の ~/.portless/ca.pem）。
          # bun / wait-on / drizzle が https://*.enterprise-agentic-saas.localhost を検証できるようにする。
          shellHook = ''
            if [ -z "''${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "''${HOME}/.portless/ca.pem" ]; then
              export NODE_EXTRA_CA_CERTS="''${HOME}/.portless/ca.pem"
            fi
          '';
        };
      in
      {
        devShells.default = devShell;
        checks.devShell = devShell;
      }
    );
}
