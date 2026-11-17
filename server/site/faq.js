// One source for each page's FAQ: it renders the visible accordion AND the
// FAQPage JSON-LD, so the schema always matches what visitors can read (AEO).
// Answers lead with the direct answer, then add detail, which suits AI answer
// engines. Course facts come from the supplied course plans — keep them in sync.

import { TIERS } from '../commerce/plans.js';

const FAQS = {
  services: [
    ['What services does Click2Client Media offer?', 'Click2Client Media offers digital marketing (Google Ads, Meta Ads, social media and branding), SEO, web development on WordPress and custom code, UI/UX design, and CRM and app development. It is based in Madurai, Tamil Nadu, and works with businesses across India and internationally.'],
    ['What is included in your SEO services?', 'SEO services cover technical SEO, on-page SEO, schema markup, internal linking, local and e-commerce SEO, off-page SEO, keyword research, competitor analysis, content SEO and strategy. Work starts with an evidence-based audit, and progress is reported from Google Search Console and Google Analytics.'],
    ['Do you guarantee first-page Google rankings?', 'No. Nobody can honestly guarantee Google rankings. We fix what is holding your website back, show you the evidence, and report on real results such as visibility, traffic and enquiries.'],
    ['What kinds of websites do you build?', 'We build WordPress websites (business, corporate, landing pages and WooCommerce e-commerce stores) and custom-coded websites using HTML, CSS, JavaScript and modern frameworks. They are built to load fast on mobile and to be search-friendly from the start.'],
    ['Do you build CRMs and custom business software?', 'Yes. We build CRMs, dashboards, internal tools, web applications, SaaS platforms and business automation systems that replace spreadsheets and manual follow-ups.'],
    ['How does a project work?', 'Every project follows five steps: discover your business and goals, audit your current digital presence, build the right strategy, execute across SEO, marketing and technology, then measure, optimise and scale.'],
    ['Do you work with businesses outside Madurai?', 'Yes. We are based in Madurai, Tamil Nadu, and work with businesses across India and internationally.'],
    ['How do I get started?', 'Run the free 10-page SEO audit or send an enquiry. We will reply with honest next steps.'],
  ],
  audit: [
    ['What does the free SEO audit include?', 'The free audit crawls up to 10 pages of your live website and gives you an overall SEO score with category scores. It checks titles, meta descriptions, headings, image ALT text, broken links, canonical tags, your sitemap and robots.txt, indexability, HTTPS, and speed and mobile indicators, with evidence for every finding.'],
    ['What do the paid audits add?', 'The 25-page audit (₹{p25}) checks 25 pages and adds how to fix every issue, with platform-specific steps. The 50-page SEO Growth Audit (₹{p50}) checks 50 pages and adds priority, impact and difficulty for every issue, a personalised 4-week roadmap and a downloadable PDF report.'],
    ['What does the SEO audit check?', 'It checks technical SEO (robots.txt, XML sitemap, canonical tags, index and noindex, HTTP status, redirects, broken links, HTTPS and crawlability), on-page SEO (titles, meta descriptions, heading structure, image ALT text and links), and performance and schema (Core Web Vitals where Google has data, and Organization, LocalBusiness, Product, Article, FAQ and Breadcrumb schema).'],
    ['How is the SEO score calculated?', 'A rule engine scores the checks that could be verified on your live pages out of 100. If something cannot be verified, for example Core Web Vitals for a site Google has no data on, the report says so instead of guessing.'],
    ['Do you guarantee first-page rankings?', 'No. Nobody can honestly guarantee Google rankings. The audit shows you the evidence for what is holding your website back, so you can fix it or have our team do it.'],
    ['Can you fix the issues the audit finds?', 'Yes. Our team handles SEO implementation, website fixes and redesigns, so the same people who find the problems can solve them.'],
  ],
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

// Audit prices are editable in the admin, so answers carry {p25}/{p50} placeholders.
const fill = (s) => s.replace(/\{(p25|p50)\}/g, (_, k) => TIERS[k].price);

export const hasFaq = (id) => Object.hasOwn(FAQS, id);
export const faqHtml = (id) => FAQS[id].map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(fill(a))}</p></details>`).join('');
export const faqSchema = (id) => ({ '@type': 'FAQPage', mainEntity: FAQS[id].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: fill(a) } })) });
