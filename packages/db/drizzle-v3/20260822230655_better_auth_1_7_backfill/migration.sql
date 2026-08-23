CREATE TEMP TABLE `_better_auth_1_7_guard` (
	`valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
INSERT INTO `_better_auth_1_7_guard` (`valid`)
SELECT CASE
	WHEN EXISTS (
		SELECT 1
		FROM `account`
		WHERE `provider_id` NOT IN ('credential', 'github')
	) THEN 0
	ELSE 1
END;
--> statement-breakpoint
DELETE FROM `_better_auth_1_7_guard`;
--> statement-breakpoint
INSERT INTO `_better_auth_1_7_guard` (`valid`)
SELECT CASE
	WHEN EXISTS (
		SELECT 1
		FROM `account`
		WHERE `provider_id` = 'credential' AND `account_id` != `user_id`
	) THEN 0
	ELSE 1
END;
--> statement-breakpoint
DELETE FROM `_better_auth_1_7_guard`;
--> statement-breakpoint
UPDATE `account`
SET `issuer` = CASE `provider_id`
	WHEN 'credential' THEN 'local:credential'
	WHEN 'github' THEN 'local:oauth:github'
END;
--> statement-breakpoint
INSERT INTO `_better_auth_1_7_guard` (`valid`)
SELECT CASE
	WHEN EXISTS (
		SELECT 1
		FROM `account`
		GROUP BY `issuer`, `account_id`
		HAVING `issuer` IS NULL OR COUNT(*) > 1
	) THEN 0
	ELSE 1
END;
--> statement-breakpoint
DELETE FROM `_better_auth_1_7_guard`;
--> statement-breakpoint
INSERT INTO `_better_auth_1_7_guard` (`valid`)
SELECT CASE
	WHEN EXISTS (
		SELECT 1
		FROM `oauth_client`
			WHERE `type` IS NOT NULL
				AND `type` NOT IN ('web', 'native', 'user-agent-based')
	) THEN 0
	ELSE 1
END;
--> statement-breakpoint
DELETE FROM `_better_auth_1_7_guard`;
--> statement-breakpoint
INSERT INTO `_better_auth_1_7_guard` (`valid`)
SELECT CASE
	WHEN EXISTS (
		SELECT 1
		FROM `oauth_client`
		WHERE `token_endpoint_auth_method` IS NULL
			AND COALESCE(`public`, false) = false
			AND `client_secret` IS NULL
	) THEN 0
	ELSE 1
END;
--> statement-breakpoint
DELETE FROM `_better_auth_1_7_guard`;
--> statement-breakpoint
UPDATE `oauth_client`
SET
		`application_type` = COALESCE(
			`application_type`,
			CASE `type`
				WHEN 'user-agent-based' THEN 'web'
				ELSE `type`
			END
		),
	`client_credentials_scopes` = COALESCE(`client_credentials_scopes`, '[]'),
	`token_endpoint_auth_method` = COALESCE(
		`token_endpoint_auth_method`,
		CASE WHEN `public` = true THEN 'none' ELSE 'client_secret_basic' END
	);
--> statement-breakpoint
DROP TABLE `_better_auth_1_7_guard`;
