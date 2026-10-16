/* ============================================================
   Contact page copy. Keys: contact.<path> (page path /contact-us).
   Form labels and messages are visitor-facing: no em dashes.
   ============================================================ */
export const contactPage = {
  meta: {
    title: "Contact Us",
    description:
      "Call or WhatsApp Samruddhi Fire on +91 88984 20303, email samruddhifire@gmail.com, or visit us in Koparkhairane, Navi Mumbai.",
  },
  hero: {
    kicker: "Contact",
    title: "Talk to us",
    lead: "Call, WhatsApp or send a message. We are open Monday to Saturday, 9 am to 8 pm.",
  },
  reach: {
    heading: "Reach us directly",
    call: "Call",
    whatsapp: "WhatsApp",
    email: "Email",
    officeLabel: "Office",
    hoursLabel: "Hours",
    areasLabel: "Service area",
    areasLink: "See our service areas",
  },
  form: {
    heading: "Send an enquiry",
    intro: "Tell us a little about your building and what you need. We will get back to you during working hours.",
    name: "Your name",
    phone: "Phone number",
    email: "Email (optional)",
    service: "Service",
    servicePlaceholder: "Choose a service",
    other: "Something else",
    message: "Message",
    messageHint: "For example: the type of building, its location, and what you need.",
    submit: "Send enquiry",
    sending: "Sending...",
    successTitle: "Thank you, we have your message.",
    successText: "We will get back to you during working hours. If it is urgent, please call us.",
    noscript: "This form needs JavaScript. Please call, WhatsApp or email us instead.",
  },
  map: {
    kicker: "Find us",
    heading: "Our office in Koparkhairane",
    title: "Map showing the Samruddhi Fire office in Koparkhairane, Navi Mumbai",
    directions: "Get directions",
  },
} as const;

/* Form validation messages: shared by the browser and the server
   (src/lib/leads.ts), so both say the same thing. */
export const formErrors = {
  name: "Please enter your name.",
  phone: "Please enter a valid phone number.",
  email: "Please enter a valid email address, or leave it empty.",
  service: "Please choose a service.",
  message: "Please tell us a little about what you need.",
  tooLong: "That message is too long. Please keep it shorter, or call us.",
  rate: "We have received several messages from you already. Please call us instead.",
  server: "Something went wrong on our side. Please try again, or call us.",
  network: "No connection. Please check your internet and try again.",
} as const;
