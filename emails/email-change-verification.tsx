// Email-change verification — sent to the NEW email address when a customer
// requests an email change at /account/profile. Clicking the link commits
// the change + invalidates their current session.
//
// Mirrors login-link.tsx visual structure but with copy specific to the
// 24-hour email-change audience. Sent via Resend from hello@mujoworld.com.

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type Props = {
  href: string;
  oldEmail: string;
  newEmail: string;
};

const ORANGE = "#f2682f";
const INK = "#0f0f0f";
const CREAM = "#f5f0e6";

export function EmailChangeVerificationEmail({
  href,
  oldEmail,
  newEmail,
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your new Mujo email address</Preview>
      <Body
        style={{
          backgroundColor: CREAM,
          margin: 0,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <Container
          style={{ maxWidth: 540, margin: "0 auto", padding: "40px 24px" }}
        >
          <Section>
            <Heading
              as="h1"
              style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontSize: 28,
                fontWeight: 400,
                color: INK,
                margin: "0 0 16px 0",
                lineHeight: 1.2,
              }}
            >
              Confirm your new email
            </Heading>
            <Text
              style={{
                fontSize: 16,
                color: INK,
                lineHeight: 1.5,
                margin: "0 0 24px 0",
              }}
            >
              Someone — hopefully you — asked to change the email on the Mujo
              account currently registered to <strong>{oldEmail}</strong>. To
              complete the change, click below to confirm{" "}
              <strong>{newEmail}</strong>.
            </Text>

            <Section style={{ textAlign: "center", margin: "32px 0" }}>
              <Button
                href={href}
                style={{
                  backgroundColor: ORANGE,
                  color: "#ffffff",
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  padding: "14px 28px",
                  borderRadius: 999,
                  display: "inline-block",
                  letterSpacing: 0.2,
                }}
              >
                Confirm new email
              </Button>
            </Section>

            <Text
              style={{
                fontSize: 14,
                color: "#555",
                lineHeight: 1.5,
                margin: "0 0 8px 0",
              }}
            >
              This link works for 24 hours and can only be used once. After
              you confirm, you&apos;ll be signed out and need to sign back in
              with the new address.
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: "#555",
                lineHeight: 1.5,
                margin: "0 0 24px 0",
              }}
            >
              If you didn&apos;t request this change, ignore this email — your
              account stays on {oldEmail} and no changes are made.
            </Text>

            <Hr style={{ borderColor: "#ddd", margin: "32px 0" }} />

            <Text
              style={{
                fontSize: 13,
                color: "#777",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Need help? Reply to this email or reach us at{" "}
              <a href="mailto:hello@mujoworld.com" style={{ color: INK }}>
                hello@mujoworld.com
              </a>
              .
            </Text>
            <Text
              style={{ fontSize: 12, color: "#999", margin: "24px 0 0 0" }}
            >
              Mujo Co. — modern performance without the crash.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default EmailChangeVerificationEmail;
