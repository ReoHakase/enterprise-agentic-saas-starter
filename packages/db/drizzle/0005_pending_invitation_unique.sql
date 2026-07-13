UPDATE `invitation`
SET `email` = lower(trim(`email`));
--> statement-breakpoint
UPDATE `invitation`
SET `status` = 'expired'
WHERE `status` = 'pending'
  AND `expires_at` <= cast(unixepoch('subsecond') * 1000 as integer);
--> statement-breakpoint
WITH `ranked_pending` AS (
  SELECT
    `id`,
    row_number() OVER (
      PARTITION BY `organization_id`, lower(`email`)
      ORDER BY `created_at` DESC, `id` DESC
    ) AS `duplicate_rank`
  FROM `invitation`
  WHERE `status` = 'pending'
)
UPDATE `invitation`
SET `status` = 'expired'
WHERE `id` IN (
  SELECT `id`
  FROM `ranked_pending`
  WHERE `duplicate_rank` > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_pending_organization_email_uidx`
ON `invitation` (`organization_id`, lower(`email`))
WHERE `status` = 'pending';
