import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import type { ReactNode } from "react"

type AppEmailProps = {
  appName: string
  preview: string
  eyebrow: string
  title: string
  children: ReactNode
  actionLabel: string
  actionUrl: string
  securityNote: string
}

export const AppEmail = ({
  appName,
  preview,
  eyebrow,
  title,
  children,
  actionLabel,
  actionUrl,
  securityNote,
}: AppEmailProps) => (
  <Html lang="en">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={styles.body}>
      <Container style={styles.container}>
        <Section style={styles.brandBar}>
          <Text style={styles.brandMark}>E</Text>
          <Text style={styles.brandName}>{appName}</Text>
        </Section>

        <Section style={styles.card}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Heading as="h1" style={styles.heading}>
            {title}
          </Heading>
          <Section style={styles.copy}>{children}</Section>
          <Section style={styles.actionRow}>
            <Button href={actionUrl} style={styles.button}>
              {actionLabel}
            </Button>
          </Section>

          <Section style={styles.fallback}>
            <Text style={styles.fallbackLabel}>
              Button not working? Open this secure link:
            </Text>
            <Link href={actionUrl} style={styles.fallbackLink}>
              {actionUrl}
            </Link>
          </Section>

          <Hr style={styles.divider} />
          <Text style={styles.securityNote}>{securityNote}</Text>
        </Section>

        <Text style={styles.footer}>
          Sent by {appName}. This automated security message cannot receive
          replies.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const EmailParagraph = ({ children }: { children: ReactNode }) => (
  <Text style={styles.paragraph}>{children}</Text>
)

const styles = {
  body: {
    backgroundColor: "#f4f6f8",
    color: "#18181b",
    fontFamily:
      "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    margin: "0",
    padding: "40px 16px",
  },
  container: {
    margin: "0 auto",
    maxWidth: "560px",
  },
  brandBar: {
    marginBottom: "20px",
  },
  brandMark: {
    backgroundColor: "#18181b",
    borderRadius: "10px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "16px",
    fontWeight: "700",
    lineHeight: "36px",
    margin: "0 10px 0 0",
    textAlign: "center" as const,
    width: "36px",
  },
  brandName: {
    color: "#27272a",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "600",
    lineHeight: "36px",
    margin: "0",
    verticalAlign: "top",
  },
  card: {
    backgroundColor: "#ffffff",
    border: "1px solid #e4e4e7",
    borderRadius: "16px",
    boxShadow: "0 12px 36px rgba(24, 24, 27, 0.06)",
    padding: "36px",
  },
  eyebrow: {
    color: "#52525b",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    lineHeight: "18px",
    margin: "0 0 10px",
    textTransform: "uppercase" as const,
  },
  heading: {
    color: "#18181b",
    fontSize: "28px",
    fontWeight: "650",
    letterSpacing: "-0.025em",
    lineHeight: "34px",
    margin: "0 0 20px",
  },
  copy: {
    margin: "0",
  },
  paragraph: {
    color: "#52525b",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 14px",
  },
  actionRow: {
    margin: "26px 0",
  },
  button: {
    backgroundColor: "#18181b",
    borderRadius: "10px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "650",
    lineHeight: "20px",
    padding: "12px 20px",
    textDecoration: "none",
  },
  fallback: {
    backgroundColor: "#f4f4f5",
    borderRadius: "10px",
    padding: "14px 16px",
  },
  fallbackLabel: {
    color: "#71717a",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "0 0 4px",
  },
  fallbackLink: {
    color: "#27272a",
    fontSize: "12px",
    lineHeight: "18px",
    overflowWrap: "anywhere" as const,
    textDecoration: "underline",
  },
  divider: {
    borderColor: "#e4e4e7",
    margin: "28px 0 20px",
  },
  securityNote: {
    color: "#71717a",
    fontSize: "12px",
    lineHeight: "19px",
    margin: "0",
  },
  footer: {
    color: "#a1a1aa",
    fontSize: "11px",
    lineHeight: "17px",
    margin: "18px 12px 0",
    textAlign: "center" as const,
  },
} as const
