import * as v from "valibot"

const emailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Enter your email address."),
  v.email("Enter a valid email address.")
)

const passwordSchema = (minimum: number, maximum: number) =>
  v.pipe(
    v.string(),
    v.minLength(
      minimum,
      `Use at least ${minimum.toString()} characters for your password.`
    ),
    v.maxLength(
      maximum,
      `Use no more than ${maximum.toString()} characters for your password.`
    )
  )

export const magicLinkFormSchema = v.object({ email: emailSchema })
export const forgotPasswordFormSchema = v.object({ email: emailSchema })

export const createSignInFormSchema = (
  minimumPasswordLength: number,
  maximumPasswordLength: number
) =>
  v.object({
    email: emailSchema,
    password: passwordSchema(minimumPasswordLength, maximumPasswordLength),
    rememberMe: v.boolean(),
  })

type PasswordFormSchemaOptions = {
  confirmPassword: boolean
  minimumPasswordLength: number
  maximumPasswordLength: number
  passwordsDoNotMatchMessage: string
}

const createPasswordConfirmationSchema = ({
  confirmPassword,
  minimumPasswordLength,
  maximumPasswordLength,
  passwordsDoNotMatchMessage,
}: PasswordFormSchemaOptions) => {
  const schema = v.object({
    password: passwordSchema(minimumPasswordLength, maximumPasswordLength),
    confirmPassword: v.string(),
  })

  return v.pipe(
    schema,
    v.forward(
      v.partialCheck(
        [["password"], ["confirmPassword"]],
        ({ password, confirmPassword: confirmation }) =>
          !confirmPassword || password === confirmation,
        passwordsDoNotMatchMessage
      ),
      ["confirmPassword"]
    )
  )
}

export const createResetPasswordFormSchema = (
  options: PasswordFormSchemaOptions
) => createPasswordConfirmationSchema(options)

export const createSignUpFormSchema = (
  options: PasswordFormSchemaOptions & { requireName: boolean }
) => {
  const nameSchema = options.requireName
    ? v.pipe(
        v.string(),
        v.trim(),
        v.minLength(1, "Enter your name."),
        v.maxLength(100, "Use 100 characters or fewer.")
      )
    : v.string()
  const schema = v.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema(
      options.minimumPasswordLength,
      options.maximumPasswordLength
    ),
    confirmPassword: v.string(),
  })

  return v.pipe(
    schema,
    v.forward(
      v.partialCheck(
        [["password"], ["confirmPassword"]],
        ({ password, confirmPassword }) =>
          !options.confirmPassword || password === confirmPassword,
        options.passwordsDoNotMatchMessage
      ),
      ["confirmPassword"]
    )
  )
}
