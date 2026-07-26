type FormFieldErrorItem = { message?: string } | undefined

export type StringFieldApi = {
  name: string
  state: {
    value: string
    meta: {
      isTouched: boolean
      isValid: boolean
      errors: FormFieldErrorItem[]
    }
  }
  handleBlur: () => void
  handleChange: (value: string) => void
}

type SubmitState = {
  canSubmit: boolean
  isDirty: boolean
  isSubmitting: boolean
}

export type SubmitSelection = readonly [
  canSubmit: boolean,
  isSubmitting: boolean,
  isDirty: boolean,
]

export const selectSubmitState = (state: SubmitState): SubmitSelection => [
  state.canSubmit,
  state.isSubmitting,
  state.isDirty,
]
