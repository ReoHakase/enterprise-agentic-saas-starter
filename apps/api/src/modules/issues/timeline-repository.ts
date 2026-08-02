import type { Db } from "@enterprise-agentic-saas/db"
import {
  issueActivityEvents,
  issueComments,
  member,
  user,
} from "@enterprise-agentic-saas/db/schema"
import { and, desc, eq, lt, sql, type SQL } from "drizzle-orm"

import {
  combineAllConditions,
  combineAnyConditions,
  compareTimelineItemsDescending,
  issueCommentSelection,
  tenantSafeAuthorJoin,
  timelineItemTypeOrder,
  toIssueCommentDto,
  type IssueTimelinePageDto,
  type OrderedIssueTimelineItem,
} from "./repository-support"
import {
  encodeIssueTimelineCursor,
  type IssueTimelineCursorPosition,
} from "./timeline-cursor"

export const listIssueTimeline = async (
  db: Db,
  input: {
    organizationId: string
    issueId: string
    cursor?: IssueTimelineCursorPosition
    limit: number
  }
): Promise<IssueTimelinePageDto> => {
  const activityConditions = [
    eq(issueActivityEvents.organizationId, input.organizationId),
    eq(issueActivityEvents.issueId, input.issueId),
  ]
  const commentConditions = [
    eq(issueComments.organizationId, input.organizationId),
    eq(issueComments.issueId, input.issueId),
  ]
  if (input.cursor) {
    const cursor = input.cursor
    const activityCursorConditions: SQL[] = [
      lt(issueActivityEvents.createdAt, cursor.createdAt),
      combineAllConditions(
        eq(issueActivityEvents.createdAt, cursor.createdAt),
        lt(issueActivityEvents.position, cursor.position)
      ),
      combineAllConditions(
        eq(issueActivityEvents.createdAt, cursor.createdAt),
        eq(issueActivityEvents.position, cursor.position),
        lt(issueActivityEvents.id, cursor.id)
      ),
    ]
    if (timelineItemTypeOrder.activity < timelineItemTypeOrder[cursor.type]) {
      activityCursorConditions.push(
        combineAllConditions(
          eq(issueActivityEvents.createdAt, cursor.createdAt),
          eq(issueActivityEvents.position, cursor.position),
          eq(issueActivityEvents.id, cursor.id)
        )
      )
    }
    activityConditions.push(combineAnyConditions(...activityCursorConditions))

    const commentCursorConditions: SQL[] = [
      lt(issueComments.createdAt, cursor.createdAt),
    ]
    if (cursor.position > 0) {
      commentCursorConditions.push(
        eq(issueComments.createdAt, cursor.createdAt)
      )
    } else {
      commentCursorConditions.push(
        combineAllConditions(
          eq(issueComments.createdAt, cursor.createdAt),
          lt(issueComments.id, cursor.id)
        )
      )
    }
    commentConditions.push(combineAnyConditions(...commentCursorConditions))
  }

  const [activities, comments] = await Promise.all([
    db
      .select({
        id: issueActivityEvents.id,
        kind: issueActivityEvents.kind,
        field: issueActivityEvents.field,
        fromValue: issueActivityEvents.fromValue,
        toValue: issueActivityEvents.toValue,
        actorUserId: issueActivityEvents.actorUserId,
        actorId: user.id,
        actorName: user.name,
        actorProfileImage: user.image,
        position: issueActivityEvents.position,
        createdAt: issueActivityEvents.createdAt,
      })
      .from(issueActivityEvents)
      .leftJoin(
        user,
        and(
          eq(user.id, issueActivityEvents.actorUserId),
          sql`exists (
              select 1 from ${member}
              where ${member.userId} = ${issueActivityEvents.actorUserId}
                and ${member.organizationId} = ${issueActivityEvents.organizationId}
            )`
        )
      )
      .where(and(...activityConditions))
      .orderBy(
        desc(issueActivityEvents.createdAt),
        desc(issueActivityEvents.position),
        desc(issueActivityEvents.id)
      )
      .limit(input.limit + 1),
    db
      .select(issueCommentSelection)
      .from(issueComments)
      .leftJoin(user, tenantSafeAuthorJoin)
      .where(and(...commentConditions))
      .orderBy(desc(issueComments.createdAt), desc(issueComments.id))
      .limit(input.limit + 1),
  ])

  const items: OrderedIssueTimelineItem[] = [
    ...activities.map(
      (activity): OrderedIssueTimelineItem => ({
        position: activity.position,
        item: {
          type: "activity",
          id: activity.id,
          kind: activity.kind,
          field: activity.field,
          fromValue: activity.fromValue ?? null,
          toValue: activity.toValue ?? null,
          actor: {
            id: activity.actorId,
            name:
              activity.actorId && activity.actorName
                ? activity.actorName
                : "Former member",
            profileImage: activity.actorId ? activity.actorProfileImage : null,
          },
          createdAt: activity.createdAt.toISOString(),
        },
      })
    ),
    ...comments.map((comment): OrderedIssueTimelineItem => {
      const dto = toIssueCommentDto(comment)
      return {
        position: 0,
        item: {
          type: "comment",
          id: dto.id,
          organizationId: dto.organizationId,
          issueId: dto.issueId,
          authorId: dto.authorId,
          author: dto.author,
          body: dto.body,
          createdAt: dto.createdAt,
          updatedAt: dto.updatedAt,
        },
      }
    }),
  ].toSorted(compareTimelineItemsDescending)
  const pageItems = items.slice(0, input.limit)
  const hasMore = items.length > input.limit
  const oldest = pageItems.at(-1)

  return {
    items: pageItems.map(({ item }) => item),
    nextCursor:
      hasMore && oldest
        ? encodeIssueTimelineCursor({
            type: oldest.item.type,
            createdAt: new Date(oldest.item.createdAt),
            position: oldest.position,
            id: oldest.item.id,
          })
        : null,
  }
}
