export default function validateFullE2EEnvironment() {
  const errorMessage = process.env.FULL_E2E_GATE_ERROR
  delete process.env.FULL_E2E_GATE_ERROR

  if (errorMessage) {
    throw new Error(errorMessage)
  }
}
