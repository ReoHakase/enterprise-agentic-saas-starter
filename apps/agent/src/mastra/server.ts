export default {
  host: "127.0.0.1",
  port:
    Number.isSafeInteger(Number(process.env.PORT)) &&
    Number(process.env.PORT) >= 1 &&
    Number(process.env.PORT) <= 65_535
      ? Number(process.env.PORT)
      : 4111,
}
