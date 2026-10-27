// Editable site content managed from the admin portal: Brands (client logos)
// and Products. One table (site_items); each kind declares its fields here and
// the admin editor is generated from that. Images live in Supabase Storage —
// only their URLs are stored.

import * as store from './store/db.js';

const { query: q, queryOne: one, tx } = store;

export const KINDS = {
  brand: {
    label: 'Brands', singular: 'Brand', folder: 'Brands', image: 'Logo',
    hint: 'Shown in “Brands we collaborate with” on the home page. Use real clients only, with their permission. A transparent PNG or SVG-style logo works best.',
    fields: [
      { k: 'website', label: 'Website', type: 'url', placeholder: 'https://…' },
    ],
  },
  product: {
    label: 'Products', singular: 'Product', folder: 'Products', image: 'Product image (optional)',
    hint: 'Shown on /products and in the Products band on the home page.',
    fields: [
      { k: 'tag', label: 'Tag', type: 'text', placeholder: 'e.g. Recruitment · AI', max: 60 },
      { k: 'description', label: 'Short description', type: 'textarea', required: true, max: 300 },
      { k: 'points', label: 'Key points', type: 'list', hint: 'One per line — up to 5.', max: 5 },
      { k: 'cta_label', label: 'Button text', type: 'text', placeholder: 'Explore Product', max: 40 },
      { k: 'cta_url', label: 'Button link', type: 'url', placeholder: '/enquire?service=…', hint: 'Leave empty to open the enquiry form with this product selected.' },
      { k: 'color', label: 'Icon colour', type: 'select', options: ['blue', 'purple', 'green', 'orange'] },
    ],
  },
  software: {
    label: 'Software Catalogue', singular: 'Software', folder: 'Software', image: 'Image (optional)',
    hint: 'The searchable catalogue on /products, grouped by category. Hide an item to remove it from the website without deleting it.',
    fields: [
      { k: 'category', label: 'Category', type: 'select', options: [] }, // filled from CATS below
      { k: 'description', label: 'Short description', type: 'textarea', required: true, max: 200 },
    ],
  },
  course: {
    label: 'Courses', singular: 'Course', folder: 'Courses', image: 'Course image (optional)',
    hint: 'Shown on /courses. Confirm durations, fees, delivery options and internship support with the academy before publishing changes.',
    fields: [
      { k: 'tag', label: 'Category label', type: 'text', placeholder: 'e.g. DIGITAL MARKETING · AI · GROWTH', max: 80 },
      { k: 'description', label: 'Short description', type: 'textarea', required: true, max: 400 },
      { k: 'duration', label: 'Duration', type: 'text', placeholder: '4–6 months', max: 80 },
      { k: 'format', label: 'Format', type: 'textarea', max: 300 },
      { k: 'includes', label: 'Includes', type: 'textarea', max: 400 },
      { k: 'audience', label: 'Audience', type: 'textarea', max: 400 },
      { k: 'topics', label: 'Curriculum topics', type: 'list', hint: 'One per line — up to 20.', max: 20 },
      { k: 'accent', label: 'Colour theme', type: 'select', options: ['blue', 'violet'] },
    ],
  },
};

// Product categories: also drive the category strip and the icons on /products.
export const CATS = [
  { id: 'business', name: 'Business Management', icon: 'i-biz', blurb: 'Connect core operations, customer relationships, projects, and everyday workflows.' },
  { id: 'hr', name: 'HR & Recruitment', icon: 'i-hr', blurb: 'Support employee administration and organise recruitment from application to onboarding.' },
  { id: 'school', name: 'School & Education', icon: 'i-school', blurb: 'Bring student administration, attendance, learning, and parent communication into one place.' },
  { id: 'ai', name: 'AI-Powered Software', icon: 'i-ai', blurb: 'Use AI-assisted tools to support content creation, customer service, and everyday business workflows.' },
  { id: 'finance', name: 'Finance & Accounting', icon: 'i-fin', blurb: 'Organise financial records, expense workflows, payments, and business reporting.' },
  { id: 'sales', name: 'Sales & Marketing', icon: 'i-sales', blurb: 'Help teams capture enquiries, manage campaigns, and understand customer engagement.' },
  { id: 'industry', name: 'Industry-Specific Solutions', icon: 'i-ind', blurb: 'Adapt digital systems to the workflows of specialised industries and service businesses.' },
];
KINDS.software.fields[0].options = CATS.map((c) => c.name);

// "Name|description" per line, one block per category (from the product catalogue).
const CATALOGUE = {
  business: `CRM System|Manage leads, customer records, follow-ups, and sales pipelines.
ERP System|Coordinate business functions, resources, inventory, and operational reporting.
Project Management System|Assign tasks, track milestones, manage deadlines, and collaborate with teams.
Inventory Management System|Track stock levels, product movements, purchase records, and reorder alerts.
Order Management System|Manage orders, fulfilment stages, delivery status, and order history.
Billing & Invoicing Software|Create invoices, record payments, and monitor outstanding balances.
Document Management System|Organise business files with searchable records and access controls.
Workflow Automation System|Automate repetitive steps, approvals, task routing, and notifications.
Customer Support & Ticketing System|Organise customer enquiries, support tickets, and issue resolution.
Visitor Management System|Register visitors, manage check-ins, and maintain visit records.`,
  hr: `HR Management System (HRMS)|Centralise employee records, leave, attendance, and HR workflows.
Applicant Tracking System (ATS)|Collect applications, organise candidates, and track recruitment stages.
Employee Attendance Management System|Record check-in/check-out times and generate attendance reports.
Payroll Management System|Manage salary calculations, payslip records, and payroll reporting.
Leave Management System|Submit leave requests, route approvals, and track leave balances.
Employee Performance Management System|Set goals, record reviews, and monitor performance indicators.
Employee Onboarding System|Coordinate joining documents, induction tasks, and onboarding progress.
Shift & Roster Management System|Plan staff shifts, allocate coverage, and manage schedules.
Employee Self-Service Portal|Let employees access their details and submit routine HR requests.
Recruitment & Interview Scheduling System|Coordinate vacancies, interviews, feedback, and candidate communication.`,
  school: `School Management System|Manage admissions, student records, staff information, and administration.
School Attendance Software|Record student attendance, review absences, and generate daily or monthly reports.
Student Information System|Maintain student profiles, enrolment details, and academic records.
School Fee Management System|Track fee schedules, receipts, pending balances, and collection reports.
Examination & Results Management System|Plan exams, enter marks, manage grades, and publish results.
Learning Management System|Deliver lessons, share learning materials, assign work, and track progress.
Timetable Management System|Prepare class schedules and coordinate teacher and room allocation.
Parent Communication Portal|Share notices, announcements, and student updates with parents.
Teacher Management System|Maintain teacher profiles, workloads, schedules, and responsibilities.
Homework & Assignment System|Distribute assignments, track submissions, and record feedback.
Library Management System|Manage book catalogues, lending, returns, and overdue items.
School Transport Management System|Maintain routes, vehicle records, and student transport allocations.
Preschool Management System|Manage admissions, attendance, classroom activities, and parent updates.
Hostel Management System|Coordinate room allocation, resident records, and hostel administration.
Online Examination Software|Run online tests, manage question banks, and support automated grading.
Certificate Generation System|Create and maintain student certificates and completion records.`,
  ai: `AI Chatbot System|Answer common questions and support initial customer enquiries.
AI Lead Qualification System|Categorise enquiries and help teams prioritise potential customers.
AI Resume Screening Assistant|Extract resume details and help compare candidate skills with role criteria.
AI Quiz Generator|Create draft questions, quizzes, and learning assessments.
AI Content Generation System|Draft marketing copy, captions, blog outlines, and content ideas.
AI Document Assistant|Summarise documents and organise information for review.
AI Business Assistant|Help users retrieve business information and complete routine tasks.
AI Workflow Automation System|Connect repeatable processes and automate supported workflow steps.
AI Meeting Assistant|Summarise meeting notes and identify action items.
AI Knowledge Base Assistant|Make internal information easier to search and retrieve.`,
  finance: `Accounting Management System|Record income, expenses, ledgers, and financial summaries.
Expense Management System|Capture expenses, categorise spending, and manage approvals.
Payment Tracking System|Track payment status, receipts, and outstanding balances.
Purchase Management System|Manage purchase requests, purchase orders, and supplier records.
Vendor Management System|Maintain supplier details, documents, and procurement information.
Financial Reporting Dashboard|Summarise revenue, expenses, and key financial indicators.
Tally Integration Solution|Connect supported workflows with Tally data where integration is available.
Subscription Management System|Track subscription plans, renewals, and billing records.`,
  sales: `Sales Management System|Track sales opportunities, targets, activities, and results.
Lead Capture System|Collect website enquiries and store lead information in one place.
WhatsApp Business Automation|Support approved messaging workflows and enquiry notifications.
Social Media Management System|Plan content calendars and organise publishing workflows.
Email Marketing Automation|Manage subscriber lists, campaigns, and automated email sequences.
SEO Audit & Reporting System|Identify website SEO issues and organise actionable audit reports.
Appointment Booking System|Manage availability, bookings, and appointment reminders.
Customer Feedback Management System|Collect feedback, organise responses, and review trends.
Loyalty & Rewards Management System|Manage customer reward points, benefits, and redemption records.
Marketing Analytics Dashboard|Review campaign activity, traffic, leads, and conversion metrics.`,
  industry: `Hospital Management System|Coordinate administrative records, appointments, and operational workflows.
Clinic Management System|Manage appointments, patient administration, and clinic records.
Hotel Management System|Organise reservations, room status, guest records, and front-desk operations.
Restaurant Management System|Manage orders, menus, table workflows, and day-to-day operations.
Gym Management System|Track memberships, renewals, schedules, and member records.
Real Estate Management System|Organise property listings, enquiries, and client follow-ups.
Property Rental Management System|Track rental units, tenant records, and payment schedules.
Construction Project Management System|Coordinate project tasks, milestones, resources, and progress.
Service Business Management System|Manage client projects, service requests, tasks, and reporting.
Franchise Management System|Coordinate locations, operational standards, and franchise reporting.`,
};
const SOFTWARE_SEED = CATS.flatMap((c) => CATALOGUE[c.id].split('\n').map((l) => {
  const [title, description] = l.split('|');
  return { title, data: { category: c.name, description } };
}));

// Course details come from the supplied course plans; confirm before changing.
const COURSE_SEED = [
  { title: 'AI-Powered Digital Marketing & Growth Engineering', slug: 'digital-marketing', data: {
    tag: 'DIGITAL MARKETING · AI · GROWTH',
    description: 'Learn to build digital growth strategies using SEO, paid advertising, content marketing, AI-powered creative tools, analytics, and marketing automation.',
    duration: '4–6 months (16–24 weeks)',
    format: 'Online live training options',
    includes: 'Practical projects and recorded learning access as specified in the course plan',
    audience: 'Students, graduates, working professionals, freelancers, and business owners',
    topics: ['Digital Marketing Fundamentals', 'Market Research and Consumer Psychology', 'WordPress and Website Development', 'AI Vibe Coding for Marketers', 'SEO, Local SEO, GEO, and AEO', 'Content Strategy and AI Content Creation', 'Social Media Marketing', 'Meta Ads', 'Google Ads', 'LinkedIn Advertising', 'Email and WhatsApp Marketing', 'GA4, Google Search Console, and Google Tag Manager', 'Capstone Projects and Career Preparation'],
    accent: 'blue' } },
  { title: 'AI Practitioner & Business Automation', slug: 'ai-automation', data: {
    tag: 'ARTIFICIAL INTELLIGENCE · AUTOMATION',
    description: 'Learn to use AI tools, create intelligent workflows, build AI-assisted applications, and automate repetitive business tasks.',
    duration: '4–6 months (16–24 weeks)',
    format: 'Live online options, with hybrid delivery also described in the course plan',
    includes: 'Practical AI labs, workflow blueprints, recorded learning access, and community support as applicable to the selected delivery option',
    audience: 'Students, graduates, working professionals, freelancers, content creators, and business owners',
    topics: ['AI Fundamentals', 'Advanced Prompt Engineering', 'ChatGPT, Claude, and Google Workspace', 'AI Research and Productivity', 'AI Image, Video, Voice, and Audio Creation', 'AI Vibe Coding', 'Database and Deployment Fundamentals', 'APIs and Webhooks', 'n8n, Make.com, and Zapier', 'AI Agents and Multi-Agent Systems', 'Custom Chatbots and RAG', 'Voice Agents', 'AI Testing, Privacy, and Governance', 'Practical Projects and Capstone', 'Portfolio Development', 'Internship and Career Preparation'],
    accent: 'violet' } },
];

const SEED = {
  software: SOFTWARE_SEED,
  course: COURSE_SEED,
  product: [
    { title: 'ATS System', slug: 'ats', data: { tag: 'Recruitment · AI', description: 'A smarter way to manage recruitment, applications and candidates.', points: ['Collect and organise applications', 'Track every candidate’s stage', 'AI-assisted screening'], cta_label: 'Explore ATS', color: 'blue' } },
    { title: 'AI Quiz System', slug: 'ai-quiz', data: { tag: 'Education · AI', description: 'Create intelligent quizzes and assessments powered by AI — built for students.', points: ['Generate questions with AI', 'Quizzes and assessments', 'Built for students and educators'], cta_label: 'Explore Product', color: 'purple' } },
    { title: 'To-Do List System', slug: 'productivity', data: { tag: 'Productivity', description: 'A simple digital system for managing tasks and productivity.', points: ['Plan and prioritise tasks', 'See what’s done at a glance', 'Simple enough to use daily'], cta_label: 'Explore Product', color: 'green' } },
    { title: 'CRM System', slug: 'crm', data: { tag: 'Sales · Operations', description: 'Manage leads, customers and business operations in one place.', points: ['Capture and follow up leads', 'One record for every customer', 'Day-to-day operations in one place'], cta_label: 'Explore Product', color: 'orange' } },
  ],
  // Clients from the portfolio. Logos are added in the admin (Supabase).
  brand: ['Carvello Cars', 'KinderBee', 'CODELYTIX Technologies', 'Globex Union', 'NimzLiot', 'TerraNext Global Ventures', 'Hi-Light Media'].map((title) => ({ title, data: {} })),
};

// ── Helpers ──────────────────────────────────────────────────────────────
const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n);
const slugify = (s) => txt(s, 100).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const urlOk = (u, label) => {
  if (u && !/^(https?:\/\/[^\s<>"]+|\/[^\s<>"]*)$/i.test(u)) throw bad(`${label} must start with https:// (or / for a page on this site).`);
  return u;
};
const kindOf = (kind) => { if (!KINDS[kind]) throw bad('Unknown content type.', 404); return KINDS[kind]; };
const iso = (d) => (d instanceof Date ? d.toISOString() : d ? String(d) : null);
const row = (r) => r && ({ ...r, data: r.data || {}, published: Boolean(r.published), display_order: Number(r.display_order), created_at: iso(r.created_at), updated_at: iso(r.updated_at) });

let seeded = null;
function ensureSeed() {
  seeded ||= (async () => {
    for (const [kind, items] of Object.entries(SEED)) {
      const flag = `content_seeded_${kind}`;
      if (await store.getSetting(flag, null)) continue;
      for (const [i, it] of items.entries()) {
        await q('INSERT INTO site_items (id, kind, slug, title, data, display_order) VALUES (?, ?, ?, ?, ?::jsonb, ?) ON CONFLICT (kind, slug) DO NOTHING',
          [store.newId(), kind, it.slug || slugify(it.title), it.title, JSON.stringify(it.data), i + 1]);
      }
      await store.setSetting(flag, new Date().toISOString());
    }
  })().catch((e) => { seeded = null; throw e; });
  return seeded;
}

export async function listItems(kind, { publishedOnly = true } = {}) {
  kindOf(kind);
  await ensureSeed();
  return (await q(`SELECT * FROM site_items WHERE kind = ? ${publishedOnly ? 'AND published' : ''} ORDER BY display_order, created_at`, [kind])).map(row);
}

function clean(kind, b) {
  const def = kindOf(kind);
  const title = txt(b.title, 120);
  if (!title) throw bad(`${def.singular} name is required.`);
  const data = {};
  for (const f of def.fields) {
    const v = b.data?.[f.k];
    if (f.type === 'list') data[f.k] = (Array.isArray(v) ? v : String(v ?? '').split('\n')).map((x) => txt(x, 120)).filter(Boolean).slice(0, f.max || 10);
    else if (f.type === 'url') data[f.k] = urlOk(txt(v, 600), f.label);
    else if (f.type === 'select') data[f.k] = f.options.includes(v) ? v : f.options[0];
    else data[f.k] = txt(v, f.max || (f.type === 'textarea' ? 1000 : 200));
    if (f.required && !data[f.k]?.length) throw bad(`${f.label} is required.`);
  }
  return { title, slug: slugify(b.slug || title) || 'item', data, image: urlOk(txt(b.image, 600), def.image), published: b.published === undefined ? true : Boolean(b.published) };
}

export async function saveItem(kind, id, body) {
  await ensureSeed();
  const r = clean(kind, body);
  const clash = await one('SELECT id FROM site_items WHERE kind = ? AND slug = ?', [kind, r.slug]);
  if (clash && clash.id !== id) throw bad(`Another ${KINDS[kind].singular.toLowerCase()} already uses “${r.slug}”. Change the name or slug.`, 409);
  if (id) {
    const res = await q('UPDATE site_items SET slug = ?, title = ?, data = ?::jsonb, image = ?, published = ?, updated_at = NOW() WHERE id = ? AND kind = ? RETURNING *',
      [r.slug, r.title, JSON.stringify(r.data), r.image, r.published, id, kind]);
    if (!res.length) throw bad('Item not found.', 404);
    return row(res[0]);
  }
  const n = (await one('SELECT COALESCE(MAX(display_order), 0) + 1 AS n FROM site_items WHERE kind = ?', [kind])).n;
  return row((await q('INSERT INTO site_items (id, kind, slug, title, data, image, published, display_order) VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?) RETURNING *',
    [store.newId(), kind, r.slug, r.title, JSON.stringify(r.data), r.image, r.published, Number(n)]))[0]);
}

export async function setPublished(kind, id, published) {
  const r = await q('UPDATE site_items SET published = ?, updated_at = NOW() WHERE id = ? AND kind = ? RETURNING *', [Boolean(published), id, kind]);
  if (!r.length) throw bad('Item not found.', 404);
  return row(r[0]);
}
export async function deleteItem(kind, id) {
  const r = await q('DELETE FROM site_items WHERE id = ? AND kind = ? RETURNING id', [id, kind]);
  if (!r.length) throw bad('Item not found.', 404);
}
export async function reorderItems(kind, ids) {
  kindOf(kind);
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string'))].slice(0, 500);
  await tx(async (c) => { for (const [i, id] of list.entries()) await c.query('UPDATE site_items SET display_order = $1 WHERE id = $2 AND kind = $3', [i + 1, id, kind]); });
}

// ── Public HTML ──────────────────────────────────────────────────────────
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ICON = {
  blue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5M16 11l2 2 4-4"/></svg>',
  purple: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9.1 9a3 3 0 1 1 4.2 2.7c-.8.4-1.3 1.1-1.3 2v.3M12 17.5h.01"/><circle cx="12" cy="12" r="9.5"/></svg>',
  green: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12 3 3 5-6"/></svg>',
  orange: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
};
const LOGO = '<img src="/img/c2c-mark.webp" alt="" width="64" height="64" loading="lazy" decoding="async">';
const C = { blue: 'c1', purple: 'c2', green: 'c3', orange: 'c4' };
const ctaUrl = (p) => p.data.cta_url || `/enquire?service=${encodeURIComponent(p.title)}`;

function productCard(p) {
  const d = p.data;
  return `<article class="pr-card reveal" id="${esc(p.slug)}">
    ${p.image ? `<div class="pr-shot"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" decoding="async"></div>` : ''}
    <div class="pr-top"><span class="pr-icon logo">${LOGO}</span>${d.tag ? `<span class="pr-tag">${esc(d.tag)}</span>` : ''}</div>
    <h3>${esc(p.title)}</h3>
    <p>${esc(d.description)}</p>
    ${d.points?.length ? `<ul class="pr-points">${d.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <a class="pr-cta" href="${esc(ctaUrl(p))}">${esc(d.cta_label || 'Explore Product')} <span>→</span></a>
  </article>`;
}

// Public lists fall back to the built-in seed when the database is unreachable,
// so /products and /courses always render.
const seedRows = (kind) => SEED[kind].map((it, i) => ({ id: `seed-${i}`, kind, slug: it.slug || slugify(it.title), title: it.title, data: it.data, image: '', published: true, display_order: i }));
const publicItems = (kind) => listItems(kind).catch(() => seedRows(kind));
const svgIcon = (id, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#${id}"/></svg>`;
const enquireUrl = (service) => `/enquire?service=${encodeURIComponent(service)}`;

export async function productsVars() {
  const [items, soft] = await Promise.all([listItems('product').catch(() => []), publicItems('software')]);
  const groups = CATS.map((c) => ({ c, list: soft.filter((s) => s.data.category === c.name) })).filter((g) => g.list.length);
  const tabs = [{ id: 'all', name: 'All Software', icon: 'i-custom', n: soft.length }, ...groups.map((g) => ({ id: g.c.id, name: g.c.name, icon: g.c.icon, n: g.list.length }))];
  return {
    'products.cards': items.length ? `<div class="pr-grid">${items.map(productCard).join('')}</div>` : '<p class="wk-empty">Products coming soon.</p>',
    'products.tabs': tabs.map((t, i) => `<button type="button" class="pc-tab cc-${t.id}" data-cat="${t.id}" aria-pressed="${i === 0}">${svgIcon(t.icon)}<span>${esc(t.name)}</span><em>${t.n}</em></button>`).join(''),
    'products.catalogue': groups.map(({ c, list }) => `<section class="pc-group cc-${c.id}" data-cat="${c.id}" aria-labelledby="pcg-${c.id}">
      <header class="pc-ghead"><span class="pc-gic">${svgIcon(c.icon)}</span><div><h3 id="pcg-${c.id}">${esc(c.name)} <span class="pc-n">${list.length}</span></h3><p>${esc(c.blurb)}</p></div></header>
      <ul class="pc-grid">${list.map((s) => `<li class="pc-card reveal" data-q="${esc(`${s.title} ${s.data.description} ${c.name}`.toLowerCase())}"><span class="pc-ic logo">${LOGO}</span><h4>${esc(s.title)}</h4><p>${esc(s.data.description)}</p><a href="${esc(enquireUrl(s.title))}" aria-label="Enquire about ${esc(s.title)}">Enquire <span aria-hidden="true">→</span></a></li>`).join('')}</ul>
    </section>`).join(''),
  };
}

export async function coursesVars(base) {
  const courses = await publicItems('course');
  const card = (c, i) => {
    const d = c.data, a = d.accent === 'violet' ? 'violet' : 'blue';
    const meta = [['Duration', d.duration], ['Format', d.format], ['Includes', d.includes], ['Who can join', d.audience]].filter(([, v]) => v);
    return `<article class="cc ${a}${i % 2 ? ' flip' : ''} reveal" id="${esc(c.slug)}">
      <div class="cc-art"><svg viewBox="0 0 560 420" role="img" aria-label="Collage of ${a === 'violet' ? 'an AI assistant, workflow automation nodes, chatbot and AI agent panels' : 'SEO analytics, ad campaign charts, social previews and a marketing funnel'} for the ${esc(c.title)} course"><use href="#art-${a}"/></svg></div>
      <div class="cc-body">
        <div class="cc-top"><span class="cc-no">0${i + 1}</span>${d.tag ? `<span class="cc-tag">${esc(d.tag)}</span>` : ''}</div>
        <h3>${esc(c.title)}</h3>
        <p class="cc-desc">${esc(d.description)}</p>
        <dl class="cc-meta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <div class="cc-act"><button type="button" class="btn outline lg" data-syl="syl-${esc(c.slug)}" aria-expanded="false" aria-controls="syl-${esc(c.slug)}">View Course Details</button><button type="button" class="btn primary lg" data-enquire="${esc(c.title)}">Enquire Now</button></div>
        <div class="cc-syl" id="syl-${esc(c.slug)}" hidden><h4>Key curriculum topics</h4><ol>${(d.topics || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>
      </div></article>`;
  };
  return {
    cards: courses.map(card).join(''),
    options: courses.map((c) => `<option>${esc(c.title)}</option>`).join(''),
    schema: { '@type': 'ItemList', name: 'Online courses by Click2Client Media', itemListElement: courses.map((c, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Course', name: c.title, description: c.data.description, url: `${base}/courses#${c.slug}`, provider: { '@id': `${base}/#organization` } } })) },
  };
}

export async function homeContentVars() {
  const [products, brands] = await Promise.all([listItems('product').catch(() => []), listItems('brand').catch(() => [])]);
  return {
    'home.products': products.length ? `<section class="section tint" aria-labelledby="hp-h"><div class="wrap">
      <div class="split-head reveal"><div class="sec-head"><span class="eyebrow">Our products</span><h2 id="hp-h">Digital systems, ready to use</h2></div><p>Alongside client work, we build our own software for recruitment, learning, productivity and customer management.</p></div>
      <div class="pr-mini">${products.slice(0, 4).map((p) => `<a class="pr-mini-card reveal" href="/products#${esc(p.slug)}"><span class="pr-icon sm logo">${LOGO}</span><b>${esc(p.title)}</b><span>${esc(p.data.description)}</span></a>`).join('')}</div>
      <p class="wk-all"><a class="btn outline lg" href="/products">View All Products →</a></p></div></section>` : '',
    'home.brands': brands.length ? `<section class="section brands-sec" aria-labelledby="br-h"><div class="wrap">
      <div class="sec-head center reveal"><span class="eyebrow">Brands we collaborate with</span><h2 id="br-h">Trusted by growing businesses</h2></div>
      <ul class="brands reveal">${brands.map((b) => {
        const inner = b.image ? `<img src="${esc(b.image)}" alt="${esc(b.title)} logo" loading="lazy" decoding="async">` : `<span class="brand-word">${esc(b.title)}</span>`;
        return `<li>${b.data.website ? `<a href="${esc(b.data.website)}" target="_blank" rel="noopener nofollow" aria-label="${esc(b.title)}">${inner}</a>` : inner}</li>`;
      }).join('')}</ul></div></section>` : '',
  };
}
