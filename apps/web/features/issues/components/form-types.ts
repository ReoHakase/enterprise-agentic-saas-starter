import type { IssuePriority, IssueStatus } from "./types"

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

export type IssueStatusFieldApi = {
  state: { value: IssueStatus }
  handleChange: (value: IssueStatus) => void
}

export type IssuePriorityFieldApi = {
  state: { value: IssuePriority }
  handleChange: (value: IssuePriority) => void
}

export type NullableStringFieldApi = {
  name: string
  state: { value: string | null }
  handleChange: (value: string | null) => void
}

export type LabelsFieldApi = {
  name: string
  state: { value: string[] }
  handleChange: (value: string[]) => void
}

type SubmitState = {
  canSubmit: boolean
  isSubmitting: boolean
}

export type SubmitSelection = readonly [
  canSubmit: boolean,
  isSubmitting: boolean,
]

export const selectSubmitState = (state: SubmitState): SubmitSelection => [
  state.canSubmit,
  state.isSubmitting,
]
