type FixtureButtonProps = {
  label: string
}

export const FixtureButton = ({ label }: FixtureButtonProps) => (
  <button type="button">{label}</button>
)
