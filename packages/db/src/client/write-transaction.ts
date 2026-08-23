import type { Client, InStatement, Transaction } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"

import { relations } from "../schema/relations"
import type { Db } from "./index"

const toTransactionClient = (
  parentClient: Client,
  transaction: Transaction
): Client => ({
  execute: transaction.execute.bind(transaction),
  batch: (statements) =>
    transaction.batch(
      statements.map((statement): InStatement => {
        if (!Array.isArray(statement)) return statement
        return { sql: statement[0], args: statement[1] ?? [] }
      })
    ),
  migrate: (statements) => transaction.batch(statements),
  transaction: () =>
    Promise.reject(new Error("Nested database transactions are not supported")),
  executeMultiple: transaction.executeMultiple.bind(transaction),
  sync: () =>
    Promise.reject(
      new Error("Database sync is not available inside a transaction")
    ),
  close: transaction.close.bind(transaction),
  reconnect: () => {
    throw new Error("A database transaction cannot reconnect")
  },
  get closed() {
    return transaction.closed
  },
  protocol: parentClient.protocol,
})

export const withWriteTransaction = async <T>(
  database: Db,
  operation: (transaction: Db) => Promise<T>
): Promise<T> => {
  const nativeTransaction = await database.$client.transaction("write")
  try {
    const transactionClient: Client = toTransactionClient(
      database.$client,
      nativeTransaction
    )
    const transactionDatabase = drizzle({
      client: transactionClient,
      relations,
    })
    const result = await operation(transactionDatabase)
    await nativeTransaction.commit()
    return result
  } catch (cause) {
    await nativeTransaction.rollback().catch(() => undefined)
    throw cause
  } finally {
    nativeTransaction.close()
  }
}
