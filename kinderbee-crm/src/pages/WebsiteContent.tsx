import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft, ChevronRight, ExternalLink, Eye, EyeOff, Image as ImageIcon, ImagePlus, Pencil, RefreshCw, Star, Trash2, Upload,
} from 'lucide-react'
import { brand } from '../config/brand'
import { pickImages, site, titleFromFile, uploadImage } from '../lib/website'
import { Button, Card, cx, Empty, FormModal, inputCls, Loading, PageHeader, Pill, Tabs, toast } from '../ui'

// Website Content: the photos shown on kinderbeeschools.com. Every change is saved on the live website straight away.

type Photo = { id: string; title: string; url: string; date?: string; status: 'approved' | 'pending' | 'rejected'; uploadedBy?: string }
type Img = { url: string; caption: string; fit?: 'contain' }
type Listing = { id: string; title: string; location?: string; status?: string; published?: boolean; images: Img[] }
type Post = { id: string; title: string; image?: string; date?: string; status?: string; category?: string }
type TabKey = 'gallery' | 'hero' | 'listings' | 'blog'

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
        subtitle="Photos on kinderbeeschools.com. Changes go live on the website straight away."
        actions={<a href={brand.websiteUrl} target="_blank" rel="noreferrer"><Button variant="soft" icon={ExternalLink}>Open website</Button></a>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'gallery', label: 'Gallery' },
        { key: 'hero', label: 'NTT Hero' },
        { key: 'listings', label: 'Property Listings' },
        { key: 'blog', label: 'Blog' },
      ]} />
      {tab === 'gallery' && <GalleryTab />}
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
        <p className="text-sm opacity-70">Shown in the campus gallery on the website’s About page. Hidden photos stay here but not on the site.</p>
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

// ───────── NTT / teacher-training hero photo ─────────
function HeroTab() {
  const { data, error, reload, setData } = useSite<{ nttHeroImage?: string }>('/api/settings')
  const [busy, setBusy] = useState(false)
  const photo = data?.nttHeroImage

  async function save(url: string) {
    await site('/api/settings', 'PUT', { nttHeroImage: url })
    setData((d) => ({ ...(d ?? {}), nttHeroImage: url }))
  }
  async function replace() {
    const [f] = await pickImages()
    if (!f) return
    setBusy(true)
    try {
      await save(await uploadImage(f, 'blog-uploads'))
      toast('Hero photo updated on the website')
    } catch (e) { toast(errMsg(e), 'error') } finally { setBusy(false) }
  }
  async function remove() {
    if (!confirm('Remove the photo and show the illustration again?')) return
    try { await save(''); toast('Hero photo removed') } catch (e) { toast(errMsg(e), 'error') }
  }

  if (error) return <Problem text={error} retry={reload} />
  if (!data) return <Loading />
  return (
    <Card className="p-5">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        {photo
          ? <Thumb src={photo} alt="NTT hero photo" className="aspect-[4/3]" />
          : <div className="grid aspect-[4/3] place-items-center rounded-2xl border-2 border-dashed border-charcoal/15 p-6 text-center text-sm opacity-60 dark:border-white/15">
              No photo set. The page shows the illustration (pink shape with course cards).
            </div>}
        <div>
          <h2 className="font-display text-xl">Teacher training (NTT) hero</h2>
          <p className="mt-1 text-sm opacity-70">The large photo at the top of the Teacher Training page. A landscape photo of teachers or a classroom works best.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={ImagePlus} loading={busy} onClick={replace}>{photo ? 'Replace photo' : 'Upload photo'}</Button>
            {photo && <Button variant="soft" icon={Trash2} onClick={remove}>Remove photo</Button>}
            <a href={`${brand.websiteUrl}/teacher-training`} target="_blank" rel="noreferrer"><Button variant="ghost" icon={ExternalLink}>View page</Button></a>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ───────── Property listings (Joint Ventures page) ─────────
function ListingsTab() {
  const { data, error, reload, setData } = useSite<Listing[]>('/api/opportunities')
  const [busy, setBusy] = useState('')
  const [edit, setEdit] = useState<{ listing: Listing; i: number } | null>(null)

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
  if (!data.length) return <Empty title="No property listings" text="Listings are added from the website admin (Opportunities)." />
  return (
    <div className="space-y-5">
      <p className="text-sm opacity-70">Photos for each property on the website’s Joint Ventures page. The first photo is the cover shown on the listing card.</p>
      {data.map((l) => {
        const uploading = busy.startsWith(`${l.id}:`) ? busy.slice(l.id.length + 1) : ''
        return (
          <Card key={l.id} className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl">{l.title}</h2>
                <p className="text-sm opacity-60">{[l.location, l.status].filter(Boolean).join(' · ')}{l.published === false ? ' · Not published' : ''}</p>
              </div>
              <Button icon={Upload} loading={!!uploading} disabled={!!busy && !uploading} onClick={() => add(l)}>{uploading || 'Add photos'}</Button>
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
    </div>
  )
}

// ───────── Blog cover images ─────────
function BlogTab() {
  const { data, error, reload, setData } = useSite<Post[]>('/api/blogs')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')

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
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm opacity-70">The cover image shown on each blog post and on the blog list.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts…" className={cx(inputCls, 'max-w-xs')} />
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
              <Button size="sm" variant="soft" icon={ImagePlus} loading={busy === p.id} disabled={!!busy && busy !== p.id} onClick={() => replace(p)}>Replace image</Button>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
