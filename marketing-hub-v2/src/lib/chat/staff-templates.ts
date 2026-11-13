/** Static chips for the Hub composer (editable before send). Safe for client imports. */
export const STAFF_REPLY_TEMPLATES: Array<{
  id: string;
  label: string;
  body: string;
}> = [
  {
    id: "reviewing",
    label: "Reviewing details",
    body: "Thank you — I am reviewing the details you have shared and will come back to you shortly.",
  },
  {
    id: "need-details",
    label: "Need more details",
    body: "Thank you. Could you share a couple more details so we can point this to the right team? In particular, where you are based and where the yacht or cargo is now would help.",
  },
  {
    id: "out-of-hours",
    label: "Outside UK hours",
    body: "Thank you for your message. Our team typically replies during UK business hours — we will follow up by email as soon as we can.",
  },
  {
    id: "passing-on",
    label: "Passing to the team",
    body: "Thank you. I am passing this to the right Peters & May team now. They will review and reply by email, and will ask if anything further is needed.",
  },
];
