INSERT INTO `issue_activity_events` (
  `id`,
  `organization_id`,
  `issue_id`,
  `actor_user_id`,
  `batch_id`,
  `position`,
  `kind`,
  `field`,
  `from_value`,
  `to_value`,
  `created_at`
)
SELECT
  'file:' || `files`.`id` || ':added',
  `files`.`organization_id`,
  `issue_file_owners`.`issue_id`,
  `files`.`uploader_id`,
  'file:' || `files`.`id` || ':added',
  0,
  'file_added',
  NULL,
  NULL,
  json_quote(`files`.`filename`),
  `files`.`updated_at`
FROM `files`
INNER JOIN `issue_file_owners`
  ON `issue_file_owners`.`file_id` = `files`.`id`
  AND `issue_file_owners`.`organization_id` = `files`.`organization_id`
  AND `issue_file_owners`.`owner_type` = `files`.`owner_type`
INNER JOIN `issues`
  ON `issues`.`id` = `issue_file_owners`.`issue_id`
  AND `issues`.`organization_id` = `issue_file_owners`.`organization_id`
WHERE
  `files`.`status` = 'ready'
  AND `files`.`owner_type` = 'issue'
  AND NOT EXISTS (
    SELECT 1
    FROM `issue_activity_events`
    WHERE `issue_activity_events`.`id` = 'file:' || `files`.`id` || ':added'
  );
