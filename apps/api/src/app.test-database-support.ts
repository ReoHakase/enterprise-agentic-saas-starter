import * as schema from "@enterprise-agentic-saas/db/schema"
import { createClient } from "@libsql/client"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"

export const testDb = () =>
  drizzle(createClient({ url: "file::memory:?cache=shared" }), { schema })

type TestDb = ReturnType<typeof testDb>

const resetTestDb = async (db: TestDb) => {
  await db.run(sql`pragma foreign_keys = off`)

  await Promise.all(
    [
      "agent_grants",
      "agent_connection_tickets",
      "agent_runs",
      "agent_threads",
      "agent_session_contexts",
      "organization_deletion_jobs",
      "invitation_email_jobs",
      "issue_activity_events",
      "issue_comments",
      "issue_thumbnail_selections",
      "issue_file_owners",
      "files",
      "audit_logs",
      "issues",
      "invitation",
      "rate_limit",
      "passkey",
      "account",
      "session",
      "member",
      "organization",
      "user",
    ].map((table) => db.run(sql.raw(`drop table if exists ${table}`)))
  )
}

const createIdentityAndIssueTables = async (db: TestDb) => {
  await db.run(sql`
    create table user (
      id text primary key,
      name text not null,
      email text not null unique,
      email_verified integer not null default 1,
      image text,
      created_at integer not null,
      updated_at integer not null
    )
  `)
  await db.run(sql`
    create table session (
      id text primary key,
      expires_at integer not null,
      token text not null unique,
      created_at integer not null,
      updated_at integer not null,
      ip_address text,
      user_agent text,
      user_id text not null,
      active_organization_id text
    )
  `)
  await db.run(sql`
    create table account (
      id text primary key,
      account_id text not null,
      provider_id text not null,
      user_id text not null,
      access_token text,
      refresh_token text,
      id_token text,
      access_token_expires_at integer,
      refresh_token_expires_at integer,
      scope text,
      password text,
      created_at integer not null,
      updated_at integer not null,
      foreign key (user_id) references user(id) on delete cascade
    )
  `)
  await db.run(sql`
    create index account_userId_idx on account (user_id)
  `)
  await db.run(sql`
    create table passkey (
      id text primary key,
      name text,
      public_key text not null,
      user_id text not null,
      credential_id text not null,
      counter integer not null,
      device_type text not null,
      backed_up integer not null,
      transports text,
      created_at integer,
      aaguid text,
      foreign key (user_id) references user(id) on delete cascade
    )
  `)
  await db.run(sql`
    create index passkey_userId_idx on passkey (user_id)
  `)
  await db.run(sql`
    create table organization (
      id text primary key,
      name text not null,
      slug text not null unique,
      logo text,
      created_at integer not null,
      metadata text
    )
  `)
  await db.run(sql`
    create table member (
      id text primary key,
      organization_id text not null,
      user_id text not null,
      role text not null default 'member',
      created_at integer not null,
      foreign key (organization_id) references organization(id) on delete cascade
    )
  `)
  await db.run(sql`
    create unique index member_organization_user_uidx
    on member (organization_id, user_id)
  `)
  await db.run(sql`
    create unique index member_super_admin_organization_uidx
    on member (organization_id)
    where role = 'super_admin'
  `)
  await db.run(sql`
    create table invitation (
      id text primary key,
      organization_id text not null,
      email text not null,
      role text,
      status text not null default 'pending',
      expires_at integer not null,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      inviter_id text not null,
      foreign key (organization_id) references organization(id) on delete cascade
    )
  `)
  await db.run(sql`
    create table invitation_email_jobs (
      id text primary key,
      invitation_id text not null unique,
      status text not null default 'pending',
      attempts integer not null default 0,
      last_error_code text,
      locked_at integer,
      next_attempt_at integer,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      completed_at integer,
      foreign key (invitation_id) references invitation(id) on delete cascade
    )
  `)
  await db.run(sql`
    create table rate_limit (
      id text primary key,
      key text not null unique,
      count integer not null,
      last_request integer not null
    )
  `)
  await db.run(sql`
    create table issues (
      id text primary key,
      organization_id text not null,
      number integer not null,
      revision integer not null default 1,
      title text not null,
      description text not null default '',
      status text not null default 'open',
      priority text not null default 'no_priority',
      assignee_id text,
      creator_id text not null,
      labels text not null default '[]',
      due_date integer,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      foreign key (organization_id) references organization(id) on delete cascade,
      unique (organization_id, number)
    )
  `)
  await db.run(sql`
    create table issue_comments (
      id text primary key,
      issue_id text not null,
      organization_id text not null,
      author_id text not null,
      body text not null,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      foreign key (organization_id) references organization(id) on delete cascade,
      foreign key (issue_id) references issues(id) on delete cascade
    )
  `)
  await db.run(sql`
    create table files (
      id text primary key,
      organization_id text not null,
      uploader_id text not null,
      upload_id text not null,
      owner_type text not null,
      object_key text not null,
      filename text not null,
      size_bytes integer not null,
      declared_content_type text not null,
      detected_image_format text,
      image_width integer,
      image_height integer,
      etag text,
      status text not null default 'pending',
      storage_object_id text,
      key_version integer,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      foreign key (organization_id) references organization(id) on delete cascade,
      unique (id, organization_id, owner_type)
    )
  `)
}

const createOwnershipAndAgentTables = async (db: TestDb) => {
  await db.run(sql`
    create table issue_file_owners (
      file_id text primary key,
      organization_id text not null,
      owner_type text not null default 'issue',
      issue_id text not null,
      foreign key (file_id, organization_id, owner_type)
        references files(id, organization_id, owner_type) on delete cascade,
      foreign key (issue_id) references issues(id) on delete cascade,
      unique (file_id, organization_id, issue_id)
    )
  `)
  await db.run(sql`
    create table issue_thumbnail_selections (
      organization_id text not null,
      issue_id text not null,
      file_id text not null,
      primary key (issue_id, organization_id),
      foreign key (issue_id) references issues(id) on delete cascade,
      foreign key (file_id, organization_id, issue_id)
        references issue_file_owners(file_id, organization_id, issue_id)
        on delete cascade
    )
  `)
  await db.run(sql`
    create table issue_activity_events (
      id text primary key,
      organization_id text not null,
      issue_id text not null,
      actor_user_id text,
      batch_id text not null,
      position integer not null default 0,
      kind text not null,
      field text,
      from_value text,
      to_value text,
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      foreign key (organization_id) references organization(id) on delete cascade,
      foreign key (issue_id) references issues(id) on delete cascade
    )
  `)
  await db.run(sql`
    create table audit_logs (
      id text primary key,
      organization_id text not null,
      actor_user_id text,
      action text not null,
      target_type text not null,
      target_id text,
      metadata text not null default '{}',
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      foreign key (organization_id) references organization(id) on delete cascade
    )
  `)
  await db.run(sql`
    create table organization_deletion_jobs (
      id text primary key,
      organization_id text not null,
      requested_by_user_id text not null,
      idempotency_key text not null,
      status text not null default 'pending',
      attempts integer not null default 0,
      last_error_code text,
      locked_at integer,
      next_attempt_at integer,
      requested_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      completed_at integer
    )
  `)
  await db.run(sql`
    create table agent_session_contexts (
      session_id text primary key,
      user_id text not null,
      context_epoch integer not null default 1,
      updated_at integer not null
    )
  `)
  await db.run(sql`
    create table agent_threads (
      id text primary key,
      organization_id text not null,
      owner_user_id text not null,
      title text not null,
      status text not null default 'active',
      created_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer))
    )
  `)
  await db.run(sql`
    create table agent_runs (
      id text primary key,
      organization_id text not null,
      thread_id text not null,
      root_run_id text not null,
      parent_run_id text,
      resumed_action_id text,
      session_id text not null,
      user_id text not null,
      context_epoch integer not null,
      client_message_id text,
      status text not null default 'running',
      scope text not null default 'chat',
      step_count integer not null default 0,
      tool_count integer not null default 0,
      write_count integer not null default 0,
      input_token_count integer not null default 0,
      output_token_count integer not null default 0,
      started_at integer not null default (cast(unixepoch('subsecond') * 1000 as integer)),
      expires_at integer not null,
      finished_at integer
    )
  `)
  await db.run(sql`
    create table agent_connection_tickets (
      id text primary key,
      token_hash text not null unique,
      organization_id text not null,
      thread_id text not null,
      session_id text not null,
      user_id text not null,
      context_epoch integer not null,
      issued_at integer not null,
      expires_at integer not null,
      consumed_at integer,
      revoked_at integer
    )
  `)
  await db.run(sql`
    create table agent_grants (
      id text primary key,
      token_hash text not null unique,
      kind text not null,
      organization_id text not null,
      thread_id text not null,
      run_id text,
      session_id text not null,
      user_id text not null,
      context_epoch integer not null,
      issued_at integer not null,
      expires_at integer not null,
      revoked_at integer
    )
  `)
  await db.run(sql`pragma foreign_keys = on`)
  await db.run(sql`
    create unique index organization_deletion_jobs_request_uidx
    on organization_deletion_jobs (requested_by_user_id, idempotency_key)
  `)
}

const seedTestRows = async (db: TestDb) => {
  const now = new Date()
  await db.insert(schema.user).values(
    [1, 2, 3, 4, 5].map((number) => ({
      id: `user_${number}`,
      name: `User ${number}`,
      email: `user${number}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }))
  )
  await db.insert(schema.organization).values([
    { id: "org_1", name: "Org One", slug: "org-one", createdAt: now },
    { id: "org_2", name: "Org Two", slug: "org-two", createdAt: now },
  ])
  await db.insert(schema.member).values([
    {
      id: "member_1",
      userId: "user_1",
      organizationId: "org_1",
      role: "super_admin",
      createdAt: now,
    },
    {
      id: "member_2",
      userId: "user_2",
      organizationId: "org_2",
      role: "super_admin",
      createdAt: now,
    },
    {
      id: "member_3",
      userId: "user_3",
      organizationId: "org_1",
      role: "admin",
      createdAt: now,
    },
    {
      id: "member_4",
      userId: "user_4",
      organizationId: "org_1",
      role: "member",
      createdAt: now,
    },
    {
      id: "member_5",
      userId: "user_5",
      organizationId: "org_1",
      role: "member",
      createdAt: now,
    },
    {
      id: "member_6",
      userId: "user_5",
      organizationId: "org_2",
      role: "member",
      createdAt: now,
    },
  ])
  await db.insert(schema.session).values({
    id: "session_1",
    userId: "user_1",
    token: "token_1",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: now,
    updatedAt: now,
    activeOrganizationId: "org_1",
  })
  await db.insert(schema.issues).values({
    id: "issue_1",
    organizationId: "org_1",
    number: 1,
    title: "Seed issue",
    description: "Tenant-safe seed",
    status: "open",
    priority: "high",
    assigneeId: "user_4",
    creatorId: "user_1",
    labels: ["backend"],
    dueDate: null,
    createdAt: now,
    updatedAt: now,
  })
}

export const createSeededDb = async () => {
  const db = testDb()
  await resetTestDb(db)
  await createIdentityAndIssueTables(db)
  await createOwnershipAndAgentTables(db)
  await seedTestRows(db)
  return db
}
