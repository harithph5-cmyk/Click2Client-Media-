import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft, ChevronRight, ExternalLink, Eye, EyeOff, FileCode, Image as ImageIcon, ImagePlus, Pencil, Plus, RefreshCw, Star, Trash2, Upload,
} from 'lucide-react'
import { brand } from '../config/brand'
import { pickImages, site, titleFromFile, uploadImage } from '../lib/website'
import { htmlToListing, htmlToPost, pickFile } from '../lib/html'
import { Button, Card, cx, Empty, FormModal, inputCls, Loading, PageHeader, Pill, Tabs, toast } from '../ui'

// Website Content: the photos shown on kinderbeeschools.com. Every change is saved on the live website straight away.

type Photo = { id: string; title: string; url: string; date?: string; status: 'approved' | 'pending' | 'rejected'; uploadedBy?: string }
type Img = { url: string; caption: string; fit?: 'contain' }
type Row = { label: string; value: string }
type Listing = {
  id: string; title: string; location?: string; category?: string; status?: string; published?: boolean; featured?: boolean
  headline?: string; summary?: string; area?: string; investmentRequirement?: string; partnershipModel?: string; timeline?: string
  overview?: string[]; details?: Row[]; contactPhone?: string; mapUrl?: string; images: Img[]
}
type Post = { id: string; title: string; image?: string; date?: string; status?: string; category?: string }
type TabKey = 'gallery' | 'slider' | 'hero' | 'listings' | 'blog'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

function useSite<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    try {
      setData(await site<T>(path))
      setError('')
    } catch (e) {
      setError(errMsg(e))
    }
  }, [path])
  useEffect(() => { reload() }, [reload])
  return { data, error, reload, setData }
}

function Problem({ text, retry }: { text: string; retry: () => void }) {
  return (
    <Card className="p-6">
      <p className="font-semibold text-red-600">Could not load this from the website</p>
      <p className="mt-1 text-sm opacity-70">{text}</p>
      <Button className="mt-4" variant="soft" icon={RefreshCw} onClick={retry}>Try again</Button>
    </Card>
  )
}

// Built-in website images use site-relative paths ("/opportunities/…"); uploads are full URLs
const abs = (u: string) => (u.startsWith('/') ? brand.websiteUrl + u : u)

const Thumb = ({ src, alt, contain, className }: { src: string; alt: string; contain?: boolean; className?: string }) => (
  <img src={abs(src)} alt={alt} loading="lazy"
    className={cx('w-full rounded-2xl bg-charcoal/5 dark:bg-white/5', contain ? 'object-contain' : 'object-cover', className)} />
)

export default function WebsiteContent() {
  const [tab, setTab] = useState<TabKey>('gallery')
  return (
    <>
      <PageHeader icon={ImageIcon} accent="inquiries" title="Website Content"
        subtitle="Admin panel for kinderbeeschools.com: hero images, gallery, joint ventures and blogs. Changes go live straight away."
        actions={<a href={brand.websiteUrl} target="_blank" rel="noreferrer"><Button variant="soft" icon={ExternalLink}>Open website</Button></a>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'gallery', label: 'Life at Kinderbee' },
        { key: 'slider', label: 'Course posters' },
        { key: 'hero', label: 'Hero images' },
        { key: 'listings', label: 'Joint Ventures' },
        { key: 'blog', label: 'Blog' },
      ]} />
      {tab === 'gallery' && <GalleryTab />}
      {tab === 'slider' && <SliderTab />}
      {tab === 'hero' && <HeroTab />}
      {tab === 'listings' && <ListingsTab />}
      {tab === 'blog' && <BlogTab />}
    </>
  )
}

// ───────── Gallery (About page campus gallery) ─────────
const STATUS: Record<Photo['status'], { label: string; cls: string }> = {
  approved: { label: 'Live', cls: '!bg-mint !text-mint-ink' },
  pending: { label: 'Pending', cls: '' },
  rejected: { label: 'Hidden', cls: '' },
}

function GalleryTab() {
  const { data, error, reload, setData } = useSite<Photo[]>('/api/portal/gallery')
  const [busy, setBusy] = useState('')
  const [rename, setRename] = useState<Photo | null>(null)

  async function add() {
    const files = await pickImages(true)
    if (!files.length) return
    let done = 0
    try {
      for (const f of files) {
        setBusy(`Uploading ${done + 1} of ${files.length}…`)
        const url = await uploadImage(f, 'gallery')
        await site('/api/portal/gallery', 'POST', { title: titleFromFile(f.name), url, date: new Date().toISOString().slice(0, 10) })
        done++
      }
      toast(`${done} photo${done === 1 ? '' : 's'} added to the website gallery`)
    } catch (e) {
      toast(`${done} uploaded, then: ${errMsg(e)}`, 'error')
    } finally {
      setBusy('')
      reload()
    }
  }

  async function update(p: Photo, patch: Partial<Photo>) {
    setData((rows) => rows?.map((r) => (r.id === p.id ? { ...r, ...patch } : r)) ?? rows)
    try {
      await site(`/api/portal/gallery/${p.id}`, 'PUT', patch)
    } catch (e) {
      toast(errMsg(e), 'error')
      reload()
    }
  }

  async function remove(p: Photo) {
    if (!confirm(`Delete "${p.title}" from the website gallery?`)) return
    try {
      await site(`/api/portal/gallery/${p.id}`, 'DELETE')
      setData((rows) => rows?.filter((r) => r.id !== p.id) ?? rows)
      toast('Photo deleted')
    } catch (e) { toast(errMsg(e), 'error') }
  }

  if (error) return <Problem text={error} retry={reload} />
  if (!data) return <Loading />
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm opacity-70">The “Life at Kinderbee” gallery on the website’s About page. New photos show first. Hidden photos stay here but not on the site.</p>
        <Button icon={Upload} loading={!!busy} onClick={add}>{busy || 'Upload photos'}</Button>
      </div>
      {data.length === 0 ? (
        <Empty title="No gallery photos yet" text="Upload classroom, event and campus photos." action={<Button icon={Upload} onClick={add}>Upload photos</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((p) => (
            <Card key={p.id} className="overflow-hidden p-3">
              <Thumb src={p.url} alt={p.title} className="aspect-[4/3]" />
              <div className="mt-2 flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-semibold">{p.title}</p>
                <Pill s={STATUS[p.status]?.label ?? p.status} className={STATUS[p.status]?.cls} />
              </div>
              <p className="text-xs opacity-50">{p.date}{p.uploadedBy ? ` · ${p.uploadedBy}` : ''}</p>
              <div className="mt-2 flex gap-1">
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setRename(p)} aria-label="Rename" title="Rename" />
                {p.status === 'approved'
                  ? <Button size="sm" variant="ghost" icon={EyeOff} onClick={() => update(p, { status: 'rejected' })} aria-label="Hide from website" title="Hide from website" />
                  : <Button size="sm" variant="ghost" icon={Eye} onClick={() => update(p, { status: 'approved' })} aria-label="Show on website" title="Show on website" />}
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(p)} aria-label="Delete" title="Delete" className="ml-auto !text-red-500" />
              </div>
            </Card>
          ))}
        </div>
      )}
      <FormModal open={!!rename} onClose={() => setRename(null)} title="Rename photo" initial={rename ? { title: rename.title } : undefined}
        fields={[{ key: 'title', label: 'Title shown on the website', required: true, full: true }]}
        onSubmit={async (v) => { await update(rename!, { title: String(v.title).trim() }); toast('Title updated') }} />
    </>
  )
}

// ───────── Course poster slider (Teacher Training page) ─────────
type Slide = { title: string; image: string; subtitle?: string }
// Copy of the website's built-in posters (FwaPage.tsx), shown until the first change here saves a list of its own
const DEFAULT_SLIDES: Slide[] = [
  { title: 'Advanced Diploma in Early Childhood Care & Education', image: '/images/fwa/advanced-diploma-vijayadashami-offer.jpg' },
  { title: 'Certificate in Nordic inspired Preschool Teaching', image: '/images/fwa/certificate-vijayadashami-offer.jpg' },
  { title: 'Diploma in Play school Teacher Training', image: '/images/fwa/play-school-diploma-vijayadashami-offer.jpg' },
  { title: 'Foundational Stage Curriculum Design', image: 'https://uvsqqvhjtdtsexfsinvp.supabase.co/storage/v1/object/public/NTT%20-%20Teacher%20Training/Sliders/Foundational%20Stage%20Curriculum%20Design.png' },
]

function SliderTab() {
  const { data, error, reload, setData } = useSite<{ nttSlides?: Slide[] }>('/api/settings')
  const [busy, setBusy] = useState('')
  const [rename, setRename] = useState<number | null>(null)
  const slides = data?.nttSlides?.length ? data.nttSlides : DEFAULT_SLIDES

  async function save(next: Slide[], msg?: string) {
    setData((d) => ({ ...(d ?? {}), nttSlides: next }))
    try {
      await site('/api/settings', 'PUT', { nttSlides: next })
      if (msg) toast(msg)
    } catch (e) {
      toast(errMsg(e), 'error')
      reload()
    }
  }
  async function add() {
    const files = await pickImages(true)
    if (!files.length) return
    const added: Slide[] = []
    try {
      for (const f of files) {
        setBusy(`Uploading ${added.length + 1} of ${files.length}…`)
        added.push({ title: titleFromFile(f.name), image: await uploadImage(f, 'blog-uploads') })
      }
    } catch (e) { toast(errMsg(e), 'error') } finally { setBusy('') }
    if (added.length) await save([...slides, ...added], `${added.length} poster${added.length === 1 ? '' : 's'} added to the slider`)
  }
  const move = (i: number, to: number) => {
    const next = [...slides]
    const [it] = next.splice(i, 1)
    next.splice(to, 0, it)
    save(next)
  }
  const remove = (i: number) => {
    if (slides.length === 1) return toast('Keep at least one poster in the slider', 'error')
    if (!confirm(`Remove "${slides[i].title}" from the slider?`)) return
    save(slides.filter((_, j) => j !== i), 'Poster removed')
  }

  if (error) return <Problem text={error} retry={reload} />
  if (!data) return <Loading />
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm opacity-70">The course posters that slide on the Teacher Training page, in this order. The name shows on the button under the slider.</p>
        <div className="flex gap-2">
          <a href={`${brand.websiteUrl}/teacher-training`} target="_blank" rel="noreferrer"><Button variant="ghost" icon={ExternalLink}>View page</Button></a>
          <Button icon={Upload} loading={!!busy} onClick={add}>{busy || 'Upload posters'}</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {slides.map((sl, i) => (
          <Card key={sl.image + i} className="p-3">
            <div className="relative">
              <Thumb src={sl.image} alt={sl.title} contain className="aspect-[4/5]" />
              <span className="absolute left-2 top-2 rounded-full bg-honey px-2 py-0.5 text-[10px] font-bold">{i + 1}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold">{sl.title}</p>
            <div className="mt-1 flex gap-0.5">
              <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Move earlier" title="Move earlier" className="!px-1.5" />
              <Button size="sm" variant="ghost" icon={ChevronRight} disabled={i === slides.length - 1} onClick={() => move(i, i + 1)} aria-label="Move later" title="Move later" className="!px-1.5" />
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setRename(i)} aria-label="Rename" title="Rename" className="!px-1.5" />
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(i)} aria-label="Remove" title="Remove" className="ml-auto !px-1.5 !text-red-500" />
            </div>
          </Card>
        ))}
      </div>
      <FormModal open={rename !== null} onClose={() => setRename(null)} title="Course name" initial={rename !== null ? { title: slides[rename]?.title } : undefined}
        fields={[{ key: 'title', label: 'Name shown under the slider', required: true, full: true }]}
        onSubmit={async (v) => { await save(slides.map((sl, j) => (j === rename ? { ...sl, title: String(v.title).trim() } : sl)), 'Name updated') }} />
    </>
  )
}

// ───────── Hero photos (one website setting per page) ─────────
const HEROES = [
  { key: 'homeHeroImage', title: 'Home page banner', path: '/', empty: 'No photo set: the banner video plays.',
    text: 'Background of the big banner at the top of the home page. A wide landscape photo works best; text sits on top of it.' },
  { key: 'aboutHeroImage', title: 'About page', path: '/about', empty: 'No photo set: the built-in campus photo is shown.',
    text: 'The photo beside the story at the top of the About page.' },
  { key: 'franchiseHeroImage', title: 'Preschool franchise page', path: '/preschool-franchise', empty: 'No photo set: the built-in campus photo is shown.',
    text: 'The campus photo at the top of the Preschool Franchise page.' },
  { key: 'nttHeroImage', title: 'Teacher training (NTT)', path: '/teacher-training', empty: 'No photo set: the page shows the illustration.',
    text: 'The large photo at the top of the Teacher Training page.' },
] as const
type HeroKey = (typeof HEROES)[number]['key']

function HeroTab() {
  const { data, error, reload, setData } = useSite<Partial<Record<HeroKey, string>>>('/api/settings')
  const [busy, setBusy] = useState('')

  async function save(key: HeroKey, url: string) {
    await site('/api/settings', 'PUT', { [key]: url })
    setData((d) => ({ ...(d ?? {}), [key]: url }))
  }
  async function replace(key: HeroKey) {
    const [f] = await pickImages()
    if (!f) return
    setBusy(key)
    try {
      await save(key, await uploadImage(f, 'blog-uploads'))
      toast('Hero photo updated on the website')
    } catch (e) { toast(errMsg(e), 'error') } finally { setBusy('') }
  }
  async function remove(key: HeroKey) {
    if (!confirm('Remove this photo and go back to the built-in one?')) return
    try { await save(key, ''); toast('Hero photo removed') } catch (e) { toast(errMsg(e), 'error') }
  }

  if (error) return <Problem text={error} retry={reload} />
  if (!data) return <Loading />
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {HEROES.map((h) => {
        const photo = data[h.key]
        return (
          <Card key={h.key} className="p-5">
            {photo
              ? <Thumb src={photo} alt={h.title} className="aspect-[16/9]" />
              : <div className="grid aspect-[16/9] place-items-center rounded-2xl border-2 border-dashed border-charcoal/15 p-6 text-center text-sm opacity-60 dark:border-white/15">{h.empty}</div>}
            <h2 className="mt-3 font-display text-xl">{h.title}</h2>
            <p className="mt-1 text-sm opacity-70">{h.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button icon={ImagePlus} loading={busy === h.key} disabled={!!busy && busy !== h.key} onClick={() => replace(h.key)}>{photo ? 'Replace photo' : 'Upload photo'}</Button>
              {photo && <Button variant="soft" icon={Trash2} onClick={() => remove(h.key)}>Remove</Button>}
              <a href={brand.websiteUrl + h.path} target="_blank" rel="noreferrer"><Button variant="ghost" icon={ExternalLink}>View page</Button></a>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ───────── Property listings (Joint Ventures page) ─────────
function ListingsTab() {
  const { data, error, reload, setData } = useSite<Listing[]>('/api/opportunities')
  const [busy, setBusy] = useState('')
  const [edit, setEdit] = useState<{ listing: Listing; i: number } | null>(null)
  const [details, setDetails] = useState<{ listing?: Listing; initial: Record<string, unknown> } | null>(null)

  const formOf = (l: Partial<Listing>) => ({
    ...l, overview: (l.overview ?? []).join('\n\n'),
    details: (l.details ?? []).map((r) => `${r.label}: ${r.value}`).join('\n'),
    published: l.published ?? true,
  })
  async function importHtml(l?: Listing) {
    const f = await pickFile('.html,.htm,text/html')
    if (!f) return
    const x = htmlToListing(await f.text())
    if (!x.title && !x.overview.length) return toast('No text found in that HTML file', 'error')
    const found = Object.fromEntries(Object.entries(x).filter(([, v]) => (Array.isArray(v) ? v.length : v)))
    setDetails({ listing: l, initial: formOf({ ...(l ?? {}), ...found }) })
  }
  async function saveDetails(v: Record<string, any>) {
    const str = (k: string) => String(v[k] ?? '').trim()
    if (!str('title')) throw new Error('Title is required')
    const body = {
      title: str('title'), location: str('location'), category: str('category'), status: str('status'), headline: str('headline'),
      summary: str('summary'), area: str('area'), investmentRequirement: str('investmentRequirement'), partnershipModel: str('partnershipModel'),
      timeline: str('timeline'), contactPhone: str('contactPhone'), mapUrl: str('mapUrl'), published: !!v.published, featured: !!v.featured,
      overview: str('overview').split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean),
      details: str('details').split('\n').map((line) => { const i = line.indexOf(':'); return { label: line.slice(0, i).trim(), value: line.slice(i + 1).trim() } })
        .filter((r) => r.label && r.value),
    }
    const target = details?.listing
    if (target) await site(`/api/opportunities/${target.id}`, 'PUT', body)
    else await site('/api/opportunities', 'POST', { ...body, terms: [], development: [], partnershipOptions: [], images: [] })
    toast(target ? 'Listing updated on the website' : 'Listing added to the website')
    reload()
  }
  async function removeListing(l: Listing) {
    if (!confirm(`Delete "${l.title}" from the Joint Ventures page? Its photos and details will be removed.`)) return
    try {
      await site(`/api/opportunities/${l.id}`, 'DELETE')
      setData((rows) => rows?.filter((r) => r.id !== l.id) ?? rows)
      toast('Listing deleted')
    } catch (e) { toast(errMsg(e), 'error') }
  }

  async function save(l: Listing, images: Img[], msg?: string) {
    setData((rows) => rows?.map((r) => (r.id === l.id ? { ...r, images } : r)) ?? rows)
    try {
      await site(`/api/opportunities/${l.id}`, 'PUT', { images })
      if (msg) toast(msg)
    } catch (e) {
      toast(errMsg(e), 'error')
      reload()
    }
  }

  async function add(l: Listing) {
    const files = await pickImages(true)
    if (!files.length) return
    const added: Img[] = []
    try {
      for (const f of files) {
        setBusy(`${l.id}:Uploading ${added.length + 1} of ${files.length}…`)
        added.push({ url: await uploadImage(f, 'opportunities'), caption: titleFromFile(f.name) })
      }
    } catch (e) {
      toast(errMsg(e), 'error')
    } finally {
      setBusy('')
    }
    if (added.length) await save(l, [...l.images, ...added], `${added.length} photo${added.length === 1 ? '' : 's'} added to ${l.title}`)
  }

  const move = (l: Listing, i: number, to: number) => {
    const imgs = [...l.images]
    const [it] = imgs.splice(i, 1)
    imgs.splice(to, 0, it)
    save(l, imgs, to === 0 ? 'Cover photo set' : undefined)
  }
  const remove = (l: Listing, i: number) => {
    if (!confirm('Delete this photo from the listing?')) return
    save(l, l.images.filter((_, j) => j !== i), 'Photo deleted')
  }

  if (error) return <Problem text={error} retry={reload} />
  if (!data) return <Loading />
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm opacity-70">Listings on the website’s Joint Ventures page. Upload an HTML file to fill in a listing, check it, then save. The first photo is the cover.</p>
        <div className="flex gap-2">
          <Button variant="soft" icon={FileCode} onClick={() => importHtml()}>Upload HTML</Button>
          <Button icon={Plus} onClick={() => setDetails({ initial: formOf({}) })}>New listing</Button>
        </div>
      </div>
      {!data.length && <Empty title="No joint venture listings" text="Add one, or upload an HTML file describing the property." />}
      {data.map((l) => {
        const uploading = busy.startsWith(`${l.id}:`) ? busy.slice(l.id.length + 1) : ''
        return (
          <Card key={l.id} className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl">{l.title}</h2>
                <p className="text-sm opacity-60">{[l.location, l.status].filter(Boolean).join(' · ')}{l.published === false ? ' · Not published' : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="soft" icon={Pencil} onClick={() => setDetails({ listing: l, initial: formOf(l) })}>Edit details</Button>
                <Button size="sm" variant="soft" icon={FileCode} onClick={() => importHtml(l)}>Update from HTML</Button>
                <Button size="sm" icon={Upload} loading={!!uploading} disabled={!!busy && !uploading} onClick={() => add(l)}>{uploading || 'Add photos'}</Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeListing(l)} aria-label="Delete listing" title="Delete listing" className="!text-red-500" />
              </div>
            </div>
            {l.images.length === 0 ? <p className="text-sm opacity-60">No photos yet.</p> : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {l.images.map((img, i) => (
                  <div key={img.url + i} className="rounded-2xl border border-charcoal/10 p-2 dark:border-white/10">
                    <div className="relative">
                      <Thumb src={img.url} alt={img.caption} contain={img.fit === 'contain'} className="aspect-[4/3]" />
                      {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-honey px-2 py-0.5 text-[10px] font-bold">Cover</span>}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs">{img.caption || <span className="opacity-50">No caption</span>}</p>
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={i === 0} onClick={() => move(l, i, i - 1)} aria-label="Move left" title="Move left" className="!px-1.5" />
                      <Button size="sm" variant="ghost" icon={ChevronRight} disabled={i === l.images.length - 1} onClick={() => move(l, i, i + 1)} aria-label="Move right" title="Move right" className="!px-1.5" />
                      {i > 0 && <Button size="sm" variant="ghost" icon={Star} onClick={() => move(l, i, 0)} aria-label="Make cover" title="Make cover photo" className="!px-1.5" />}
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEdit({ listing: l, i })} aria-label="Edit caption" title="Edit caption" className="!px-1.5" />
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(l, i)} aria-label="Delete" title="Delete" className="ml-auto !px-1.5 !text-red-500" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )
      })}
      <FormModal open={!!edit} onClose={() => setEdit(null)} title="Edit photo"
        initial={edit ? { caption: edit.listing.images[edit.i].caption, whole: edit.listing.images[edit.i].fit === 'contain' } : undefined}
        fields={[
          { key: 'caption', label: 'Caption', full: true },
          { key: 'whole', label: 'Show the whole image without cropping (posters, plans)', type: 'checkbox' },
        ]}
        onSubmit={async (v) => {
          const { listing, i } = edit!
          const images = listing.images.map((img, j) => (j === i ? { url: img.url, caption: String(v.caption ?? '').trim(), ...(v.whole ? { fit: 'contain' as const } : {}) } : img))
          await save(listing, images, 'Photo updated')
        }} />
      <FormModal open={!!details} onClose={() => setDetails(null)} wide title={details?.listing ? `Edit ${details.listing.title}` : 'New joint venture listing'}
        initial={details?.initial} submitLabel="Save to website" onSubmit={saveDetails}
        fields={[
          { key: 'title', label: 'Title', required: true, full: true },
          { key: 'location', label: 'Location' }, { key: 'category', label: 'Category', placeholder: 'Land / Development' },
          { key: 'status', label: 'Status', placeholder: 'Open for partnership' }, { key: 'area', label: 'Area' },
          { key: 'investmentRequirement', label: 'Investment requirement' }, { key: 'partnershipModel', label: 'Partnership model' },
          { key: 'timeline', label: 'Timeline' }, { key: 'contactPhone', label: 'Contact phone', type: 'tel' },
          { key: 'headline', label: 'Headline (top of the detail view)', full: true },
          { key: 'summary', label: 'Summary (on the listing card)', type: 'textarea' },
          { key: 'overview', label: 'Overview (blank line between paragraphs)', type: 'textarea' },
          { key: 'details', label: 'Details table (one "Label: value" per line)', type: 'textarea' },
          { key: 'mapUrl', label: 'Google Maps link', full: true },
          { key: 'published', label: 'Show on the website', type: 'checkbox' },
          { key: 'featured', label: 'Featured', type: 'checkbox' },
        ]} />
    </div>
  )
}

// ───────── Blog: new posts from an HTML file, cover images ─────────
function BlogTab() {
  const { data, error, reload, setData } = useSite<Post[]>('/api/blogs')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  // a post read from an uploaded HTML file, waiting for the details form (target = the post it replaces)
  const [draft, setDraft] = useState<{ target?: Post; post: ReturnType<typeof htmlToPost> } | null>(null)

  async function readHtml(target?: Post) {
    const f = await pickFile('.html,.htm,text/html')
    if (!f) return
    const post = htmlToPost(await f.text())
    if (!post.content) return toast('No text found in that HTML file', 'error')
    setDraft({ target, post: { ...post, title: post.title || target?.title || titleFromFile(f.name) } })
  }

  async function publish(v: Record<string, any>) {
    const { target, post } = draft!
    const image = v.cover instanceof File ? await uploadImage(v.cover, 'blog-uploads') : target?.image ?? ''
    const body = {
      title: String(v.title).trim(), category: String(v.category || 'General').trim(), excerpt: String(v.excerpt ?? '').trim(),
      content: post.content, readTime: post.readTime, image, status: v.status || 'Published',
      metaTitle: String(v.title).trim(), metaDescription: String(v.excerpt ?? '').trim().slice(0, 160),
      ...(target ? {} : { author: 'Kinderbee', date: new Date().toISOString().slice(0, 10), views: 0 }),
    }
    if (target) await site(`/api/blogs/${target.id}`, 'PUT', body)
    else await site('/api/blogs', 'POST', body)
    toast(target ? 'Post updated on the website' : body.status === 'Published' ? 'Post published on the website' : 'Saved as draft')
    reload()
  }

  async function removePost(p: Post) {
    if (!confirm(`Delete "${p.title}" from the website blog?`)) return
    try {
      await site(`/api/blogs/${p.id}`, 'DELETE')
      setData((rows) => rows?.filter((r) => r.id !== p.id) ?? rows)
      toast('Post deleted')
    } catch (e) { toast(errMsg(e), 'error') }
  }

  async function replace(p: Post) {
    const [f] = await pickImages()
    if (!f) return
    setBusy(p.id)
    try {
      const image = await uploadImage(f, 'blog-uploads')
      await site(`/api/blogs/${p.id}`, 'PUT', { image })
      setData((rows) => rows?.map((r) => (r.id === p.id ? { ...r, image } : r)) ?? rows)
      toast('Cover image updated')
    } catch (e) { toast(errMsg(e), 'error') } finally { setBusy('') }
  }

  if (error) return <Problem text={error} retry={reload} />
  if (!data) return <Loading />
  const shown = data.filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase()))
  const categories = [...new Set(data.map((p) => p.category).filter((c): c is string => !!c))]
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm opacity-70">Upload a blog post as an HTML file: its headings, paragraphs, lists and links go on the website. Cover images can be replaced per post.</p>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts…" className={cx(inputCls, 'max-w-xs')} />
          <Button icon={FileCode} onClick={() => readHtml()}>Upload HTML post</Button>
        </div>
      </div>
      {shown.length === 0 ? <Empty title="No posts found" /> : (
        <div className="space-y-3">
          {shown.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center gap-4 p-3">
              {p.image
                ? <img src={abs(p.image)} alt="" loading="lazy" className="h-16 w-24 shrink-0 rounded-xl bg-charcoal/5 object-cover" />
                : <div className="grid h-16 w-24 shrink-0 place-items-center rounded-xl bg-charcoal/5 text-xs opacity-50">No image</div>}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{p.title}</p>
                <p className="text-xs opacity-60">{[p.date, p.category, p.status].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="soft" icon={ImagePlus} loading={busy === p.id} disabled={!!busy && busy !== p.id} onClick={() => replace(p)}>Replace image</Button>
                <Button size="sm" variant="soft" icon={FileCode} onClick={() => readHtml(p)}>Replace text (HTML)</Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removePost(p)} aria-label="Delete post" title="Delete post" className="!text-red-500" />
              </div>
            </Card>
          ))}
        </div>
      )}
      <FormModal open={!!draft} onClose={() => setDraft(null)} wide submitLabel={draft?.target ? 'Update post' : 'Save to website'}
        title={draft?.target ? `Replace "${draft.target.title}"` : 'New blog post'}
        initial={draft ? {
          title: draft.post.title, excerpt: draft.post.excerpt || draft.target?.title,
          category: draft.target?.category ?? categories[0] ?? 'General', status: draft.target?.status ?? 'Published',
        } : undefined}
        fields={[
          { key: 'title', label: 'Title', required: true, full: true },
          { key: 'category', label: 'Category', type: 'select', options: categories.length ? categories : ['General'], required: true },
          { key: 'status', label: 'Status', type: 'select', options: ['Published', 'Draft'], required: true },
          { key: 'excerpt', label: 'Short description (blog list and Google)', type: 'textarea' },
          { key: 'cover', label: draft?.target ? 'New cover image (optional)' : 'Cover image', type: 'file', accept: 'image/*' },
        ]}
        onSubmit={publish}>
        {draft && <p className="mt-3 text-xs opacity-60">{draft.post.content.split('\n\n').length} blocks of text read from the file · {draft.post.readTime}</p>}
      </FormModal>
    </>
  )
}
