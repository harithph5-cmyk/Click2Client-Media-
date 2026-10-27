// One source for each page's FAQ: it renders the visible accordion AND the
// FAQPage JSON-LD, so the schema always matches what visitors can read (AEO).
// Answers lead with the direct answer, then add detail, which suits AI answer
// engines. Course facts come from the supplied course plans — keep them in sync.

const FAQS = {
  courses: [
    ['What will I learn in the SEO and digital marketing course?', 'The AI-Powered Digital Marketing & Growth Engineering course covers SEO, Local SEO, GEO and AEO, content strategy, social media marketing, Meta Ads, Google Ads, LinkedIn advertising, email and WhatsApp marketing, and analytics with GA4, Google Search Console and Google Tag Manager. It also includes WordPress, AI content workflows and a capstone project.'],
    ['What will I learn in the AI Practitioner & Business Automation course?', 'You learn to use AI tools and apply them to business work: prompt engineering, ChatGPT, Claude and Google Workspace, AI image, video and voice creation, AI vibe coding, APIs and webhooks, automation with n8n, Make.com and Zapier, AI agents, custom chatbots, RAG and voice agents, plus AI testing, privacy and governance.'],
    ['What are GEO and AEO?', 'GEO (generative engine optimisation) and AEO (answer engine optimisation) are ways of structuring content so AI assistants and search answer features can find, understand and cite it. They are taught alongside SEO and Local SEO in the digital marketing course.'],
    ['Are the courses available online?', 'Yes. The digital marketing course offers online live training options. The AI course offers live online options, with hybrid delivery also described in its course plan. Available delivery options depend on the batch you choose.'],
    ['How long does each course take?', 'Both programmes are planned for 4–6 months (16–24 weeks). The exact schedule depends on the batch.'],
    ['Do I need prior experience?', 'The programmes are designed for students, graduates, working professionals, freelancers and business owners. Ask our team about prerequisites for the batch you are interested in.'],
    ['Will I work on practical projects?', 'Yes. The digital marketing course includes practical projects and capstone projects. The AI course includes practical AI labs, workflow blueprints and a capstone.'],
    ['Are recorded sessions available?', 'Recorded learning access is part of both course plans. What is included can vary with the delivery option you select, so confirm it when you enquire.'],
    ['Are internships included?', 'Both course plans describe internship or career-preparation components. Internship arrangements depend on the course and batch, and placements or job outcomes are not guaranteed.'],
    ['How can I find out about fees?', 'Fees are shared when you enquire, together with the next batch schedule and delivery format. Current fees and options can change between batches.'],
    ['How do I enrol?', 'Send an enquiry using the form on this page. Our team will share the latest batch schedule, fee options, delivery details and the enrolment process.'],
  ],
  products: [
    ['What business software does Click2Client Media offer?', 'Click2Client Media offers 74 software solutions in seven categories: business management (CRM, ERP, project, inventory, billing), HR and recruitment (HRMS, ATS, payroll), school and education management, AI-powered software, finance and accounting, sales and marketing, and industry-specific systems such as hospital, hotel and restaurant management.'],
    ['What is a CRM system?', 'A CRM (customer relationship management) system is software that stores customer records, captures enquiries and tracks each sales opportunity in one place. Our CRM covers lead management, customer records and a sales pipeline, and can be set up around your workflow.'],
    ['Can the software be customised for my business?', 'Yes, solutions can be customised or integrated with the tools you already use. Availability and integrations depend on your requirements and a technical assessment, and some solutions may be under development.'],
    ['Do you build school management software?', 'Yes. The catalogue includes 16 school and education solutions, including a school management system, attendance, fee management, examinations and results, a learning management system and a parent communication portal.'],
    ['Do you offer AI automation and WhatsApp automation?', 'Yes. The catalogue includes an AI chatbot, AI lead qualification, AI workflow automation, an AI business assistant and WhatsApp business automation for approved messaging workflows and enquiry notifications.'],
    ['How do I book a demo?', 'Use the Book a Demo button or the enquiry form, tell us your industry and what you want to improve, and our team will reply with the right next step.'],
  ],
};

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const faqHtml = (id) => FAQS[id].map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
export const faqSchema = (id) => ({ '@type': 'FAQPage', mainEntity: FAQS[id].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
