UPDATE `invitation`
SET `status` = 'expired'
WHERE `status` = 'pending'
  AND (`role` IS NULL OR `role` NOT IN ('admin', 'member'));
--> statement-breakpoint
UPDATE `member`
SET `role` = 'super_admin'
WHERE `role` = 'owner';
--> statement-breakpoint
WITH `membership_repair` AS (
	SELECT
		`id`,
		first_value(`id`) OVER (
			PARTITION BY `organization_id`, `user_id`
			ORDER BY `created_at`, `id`
		) AS `survivor_id`,
		first_value(`role`) OVER (
			PARTITION BY `organization_id`, `user_id`
			ORDER BY
				CASE `role`
					WHEN 'super_admin' THEN 3
					WHEN 'admin' THEN 2
					WHEN 'member' THEN 1
					ELSE 0
				END DESC,
				`created_at`,
				`id`
		) AS `strongest_role`
	FROM `member`
)
UPDATE `member`
SET `role` = (
	SELECT `strongest_role`
	FROM `membership_repair`
	WHERE `membership_repair`.`survivor_id` = `member`.`id`
	LIMIT 1
)
WHERE `id` IN (SELECT `survivor_id` FROM `membership_repair`);
--> statement-breakpoint
WITH `ranked_memberships` AS (
	SELECT
		`id`,
		row_number() OVER (
			PARTITION BY `organization_id`, `user_id`
			ORDER BY `created_at`, `id`
		) AS `duplicate_rank`
	FROM `member`
)
DELETE FROM `member`
WHERE `id` IN (
	SELECT `id`
	FROM `ranked_memberships`
	WHERE `duplicate_rank` > 1
);
--> statement-breakpoint
WITH `ranked_super_admins` AS (
	SELECT
		`id`,
		row_number() OVER (
			PARTITION BY `organization_id`
			ORDER BY `created_at`, `id`
		) AS `super_admin_rank`
	FROM `member`
	WHERE `role` = 'super_admin'
)
UPDATE `member`
SET `role` = 'admin'
WHERE `id` IN (
	SELECT `id`
	FROM `ranked_super_admins`
	WHERE `super_admin_rank` > 1
);
--> statement-breakpoint
WITH `ranked_super_admin_candidates` AS (
	SELECT
		`candidate`.`id`,
		row_number() OVER (
			PARTITION BY `candidate`.`organization_id`
			ORDER BY
				CASE `candidate`.`role`
					WHEN 'admin' THEN 0
					WHEN 'member' THEN 1
					ELSE 2
				END,
				`candidate`.`created_at`,
				`candidate`.`id`
		) AS `candidate_rank`
	FROM `member` AS `candidate`
	WHERE NOT EXISTS (
		SELECT 1
		FROM `member` AS `current_super_admin`
		WHERE `current_super_admin`.`organization_id` = `candidate`.`organization_id`
		  AND `current_super_admin`.`role` = 'super_admin'
	)
)
UPDATE `member`
SET `role` = 'super_admin'
WHERE `id` IN (
	SELECT `id`
	FROM `ranked_super_admin_candidates`
	WHERE `candidate_rank` = 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_organization_user_uidx` ON `member` (`organization_id`,`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_organization_super_admin_uidx` ON `member` (`organization_id`) WHERE `role` = 'super_admin';
