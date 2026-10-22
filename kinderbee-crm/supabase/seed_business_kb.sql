-- WhatsApp AI knowledge base for business enquiries, taken from kinderbeeschools.com (October 2026).
-- Run once in Supabase → SQL Editor. Safe to re-run: articles whose title already exists are skipped.
-- Edit or switch articles off later in the CRM: WhatsApp → AI Assistant → Knowledge base.
insert into public.kb_articles (title, topic, body)
select v.title, v.topic, v.body
from (values

('About KinderBee & KIPS', 'company', $kb$
KinderBee is run by Finnish-Way Educare Private Limited (CIN U85500TN2024PTC169138, GSTIN 33AAFCF8851Q1ZZ).
Office: No. 1, Old UCO Bank Road, Rajarajeshwari Layout, Ramamurthy Nagar, Bengaluru – 560016, Karnataka.
Phone / WhatsApp: +91 93449 06393 · Email: kinderbeeschools@gmail.com · Website: www.kinderbeeschools.com
Office hours: Mon–Fri 10am–5pm, Sat 10am–1pm (this WhatsApp assistant answers 24/7).
KIPS (Kinderbee Integrated Partnership System) is KinderBee's education partnership system. It gives schools and partners academic, operational, branding and teacher-training support.
Services: zero-royalty preschool franchise; CBSE & IB school setup and consultancy; degree college / higher-education projects (KIPS-ARCADIA); joint ventures (land, investors, developers, operators); school consulting programmes; teacher training through FinnishWay Academy (NTT / ECCE diplomas and certificates). KinderBee also runs its own preschool in Ramamurthy Nagar, Bengaluru (Playgroup to UKG and daycare, ages 1.5–8).
FinnishWay Academy is the teacher-training and development wing of KinderBee: Nordic-inspired, play-based early-childhood education, classroom management and curriculum implementation.
$kb$),

('Consultation: how to get started', 'faq', $kb$
For any service, the first step is a free consultation with the KinderBee team (by phone, WhatsApp or the website).
A detailed 1:1 consultation can also be booked on the website for ₹99 (paid by UPI: Google Pay, PhonePe, Paytm), at a date and time that suits the person.
The franchise brochure (PDF) and the school setup dossier can be requested from the team or the website.
The assistant cannot book or confirm a consultation; the team confirms the slot.
$kb$),

('Preschool franchise: model and investment', 'franchise', $kb$
KinderBee offers a zero-royalty preschool franchise (KIPS partner): ₹0 royalty per month, and the partner keeps 100% of tuition fees, as set out in the written partnership agreement.
Estimated capital investment: ₹15 lakh – ₹30 lakh. It covers interior setup, safety flooring, furniture, activity kits and the marketing launch. A city-specific cost break-up is given by the team.
Space: a ground-floor residential villa or commercial property of about 1,500 – 3,500 sq. ft., with outdoor play space.
Returns depend on city, location, fees, enrolment and running costs; no return is guaranteed. The team can share the assumptions behind any projection.
Who can become a partner: educators, entrepreneurs, existing school owners, educational institutions and investors. Prior experience in education is helpful but not required; KinderBee provides training, curriculum, operational guidance and ongoing support.
Existing preschools can rebrand to KinderBee and use its curriculum, teacher training, academic systems, branding, marketing and operations guidance.
The KinderBee name, KIPS logo, mascot, lesson plans and pedagogical frameworks are the intellectual property of Finnish-Way Educare Pvt Ltd; partners use them under the brand licence.
$kb$),

('Preschool franchise: what partners receive', 'franchise', $kb$
The KIPS partner kit has twelve essentials in four stages:
1. Launch & brand: official brand licence, school design blueprint (child-safe classroom and play-area layouts), franchise operations manual.
2. Curriculum & team: custom local curriculum (Nordic/Finnish-inspired, NEP 2020 aligned, adapted to the city), staff recruitment guides, training for teachers and staff before and after launch.
3. Admissions & marketing: SEO-optimised local micro-website, admissions playbooks, monthly marketing campaigns.
4. Operations & support: school management ERP (attendance, fees, records), continuous quality audits, mentorship advisory support.
Curriculum pillars: play-based and experiential learning, NEP 2020 early childhood care and education, Finnish-inspired child-centred pedagogy, STEM and activity-based exploration, social and emotional skills, fine and gross motor development, phonics and early literacy.
$kb$),

('Preschool franchise: steps to open', 'franchise', $kb$
Eight steps from first call to first admission:
1. Enquiry & discovery call: share city, budget and plans.
2. Location & space review against the 1,500 – 3,500 sq. ft. ground-floor guideline with outdoor play space.
3. Partnership agreement in writing (partners should read it closely and take independent advice).
4. Design & set-up: blueprint, interiors, safety flooring, furniture and activity kits.
5. Team & training: staff recruitment guides and training before launch.
6. Launch & admissions: micro-website, admissions playbook and first marketing campaign.
7. Run the school on the ERP.
8. Regular quality audits and a mentor as the school grows.
Useful to know before the call: the property in mind, capital planned (₹15–30 lakh), the target city or area, and time available for local admissions.
$kb$),

('CBSE & IB school setup', 'cbse_ib_school', $kb$
KinderBee / KIPS provides turnkey consultancy to set up a CBSE school or an IB World School in India, from land sanctioning to campus inauguration: school planning and affiliation guidance, infrastructure design, teacher training and digital admissions support.
CBSE school: CBSE-aligned curriculum, NEP 2020 framework, STEM and smart classrooms, complete CBSE SARAS affiliation documentation support. Estimated outlay ₹2 crore – ₹5 crore+.
IB World School (PYP, MYP, DP): inquiry-based curriculum, IB candidacy and authorisation roadmaps. Estimated outlay ₹5 crore – ₹15 crore+.
Investment varies with land ownership, scale and facilities. Land must meet the CBSE Affiliation Bye-Laws (typically 1.5 to 2+ acres depending on municipal/urban limits).
Suitable for entrepreneurs, education investors, existing school owners upgrading or adding a curriculum, educational trusts and charitable societies. Works in Tier 1, 2 and 3 cities.
Six-step advisory: 1) feasibility and project report (demographic analysis, catchment survey, financial modelling, 10-year P&L); 2) campus architecture and interiors; 3) affiliation and statutory approvals (State NOC, society bye-laws, CBSE SARAS filing, IB candidacy); 4) faculty hiring and training (principal onboarding, teacher recruitment); 5) EdTech and school ERP (digital boards, ERP, RFID/CCTV); 6) admissions campaign and launch.
Recommended facilities: smart classrooms, science and computer labs, maths and innovation labs, STEM/robotics lab, library, art and performing arts studios, sports complex, auditorium, teacher resource centre, infirmary, safe washrooms and CCTV.
Affiliation and authorisation are decided by CBSE, the IB and State authorities; KinderBee prepares and supports the documentation but cannot guarantee approval, timelines or enrolment.
To begin: request the school setup dossier and share location, board preference (CBSE or IB) and timeline.
$kb$),

('Degree college & higher education (KIPS-ARCADIA)', 'degree_college', $kb$
KIPS-ARCADIA is KinderBee's global education investment initiative for family offices, entrepreneurs, philanthropists, foundations and impact investors.
Four ways to take part: 1) acquire an education asset (operating K-12 schools, institutional campuses, education real estate); 2) co-create an ARCADIA greenfield higher-education opportunity in a suitable Indian State; 3) build-to-suit campuses; 4) create an education legacy (named schools, centres of excellence, labs, scholarship endowments).
ARCADIA - Global University is KIPS's proposed flagship higher-education initiative. Indicative disciplines: Business & Management, Economics, Accounting & Finance, Entrepreneurship & Innovation, Game Design & Interactive Tech, Biomedical Sciences, Data Science, Artificial Intelligence, Software Engineering, Cybersecurity. Final programmes depend on UGC, State and regulator requirements.
KIPS's role: originating assets and sites, evaluating market, title and feasibility, structuring the project and funding pathway, academic and campus master planning, coordinating regulatory and execution work, and preparing brand, recruitment and launch.
Current sourcing includes operating school assets and institutional campuses in Tamil Nadu; details are released only after verification, investor qualification and, where appropriate, an NDA.
This is not a securities offering. No regulatory approval or financial return is assured. Foreign participation depends on applicable law and is reviewed project by project.
To begin, share preferred geography, indicative capital commitment, education interests and the role they want; KIPS then prepares an opportunity brief.
$kb$),

('Joint ventures', 'joint_ventures', $kb$
KIPS lists land, premises and education projects across India and brings landowners, investors, developers and operators together in structured joint ventures (for example a preschool, school or college).
Roles: landowner contributes land or premises; investor/developer brings capital or construction; operator runs the facility; KIPS sources and screens opportunities, connects the parties, coordinates site visits and discussions, and brings education expertise (preschool, CBSE school and degree college setup, curriculum, teacher training).
Common structures: development JV, build-to-suit, long-term lease or rental, revenue share, SPV (separate project company).
Process: discover, connect (submit an investor or partner enquiry), evaluate, structure, execute.
Current listings: Whitefield land opportunity (EPIP Zone, Bengaluru, about 22,000 sq. ft. / 0.5 acre, open for partnership) and a 4 BHK duplex for rent in Bengaluru (3,000 sq. ft. built-up; exact location shared on enquiry). More listings are coming across India.
Investor ranges on the enquiry form: ₹10L–25L, ₹25L–50L, ₹50L–1Cr, ₹1Cr+.
Landowners and developers can submit their own land or project for evaluation and listing.
Listings are preliminary and non-binding; quoted rates are not final prices; there are no assured returns; final terms apply only through definitive agreements. Each party should take independent legal, tax and financial advice.
$kb$),

('School consulting programmes', 'consulting', $kb$
For schools and education entrepreneurs, KinderBee offers:
- School Development Partnership: multi-year alliance from blueprint to operations, affiliation and compliance oversight (State NOC, CBSE SARAS), SOPs.
- New School Planning and Establishment: 6–18 month turnkey project for preschools, CBSE or IB schools (catchment survey, fee feasibility, campus design, procurement).
- Existing School Transformation: 3–12 month turnaround for schools with falling enrolment or ageing infrastructure (academic and operational audit, curriculum modernisation, teacher re-training).
- Curriculum and Academic Support: NEP 2020 aligned curriculum for the foundational stage (ages 2–8) and primary, with lesson plans, workbooks and assessment rubrics (annual licensing).
- School Management and Operational Guidance: SOP manuals, fee structuring and recovery, parent communication policies.
- Teacher Recruitment and Professional Development: talent sourcing, induction bootcamp, quarterly workshops.
- Branding, Admissions and Growth Support: competitor analysis, digital admissions campaigns, prospectus and brochure design (3–6 months per admission cycle).
Fees for these programmes are shared by the team after understanding the school's needs.
$kb$),

('Teacher training (FinnishWay Academy)', 'teacher_training', $kb$
Teacher training is run by FinnishWay Academy, KinderBee's teacher-development wing. Admissions are open for 2026–27. Certificates are issued by FinnishWay Academy.
Programmes:
1. Advanced Diploma in Early Childhood Care & Education (NTT / ECCE): 120 hours over 12 weeks (60 hrs masterclasses, 40 hrs simulation labs, 20 hrs capstone). Modules: child development and psychology, play-based teaching, curriculum and activity planning, practical classroom training, AI-assisted curriculum. For aspiring and working teachers.
2. Diploma in Play School Teacher Training: child development basics, play-based methods, activity planning, practical teaching. For preschool educators.
3. Certificate in Nordic-inspired Preschool Teaching: Nordic methods, play-based and child-centred learning, creative classroom activities.
4. Foundational Stage Curriculum Design: NEP 2020 and NCF-FS aligned curriculum planning, learning outcomes and activities.
Every programme includes an AI-assisted curriculum module: AI lesson planning, activity and worksheet creation, digital teaching resources, responsible use of AI with young children.
Other options: Nursery Teacher Training (1-year diploma, hybrid or classroom), Play-Based Teacher Training (3 months), AI-Enhanced Preschool Teacher Training (6 weeks online), short certificate courses (2–4 weeks: Jolly Phonics, early maths, storytelling and puppetry, behaviour management) and 1–3 day CPD workshops for school staff.
Course fees and current offers: the team shares the latest fee and any running offer.
$kb$)

) as v(title, topic, body)
where not exists (select 1 from public.kb_articles k where k.title = v.title);
