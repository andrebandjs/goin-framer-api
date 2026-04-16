import { connect } from "framer-api"
import fs from "fs"

// ─── Configuração ────────────────────────────────────────────────────────────
const PROJECT_URL  = process.env.FRAMER_PROJECT_URL  ?? "https://framer.com/projects/Novo-GoInsiders--WRkzMrZ9UaJlhXKmSKwI-c5KbH"
const API_KEY      = process.env.FRAMER_API_KEY      ?? ""
const OUTPUT_FILE  = "blog.json"
const SITE_BASE    = "https://goinsiders.com.br"
const BLOG_PREFIX  = "/blog"

if (!API_KEY) throw new Error("FRAMER_API_KEY não definida. Configure a variável de ambiente.")

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔌 Conectando ao projeto Framer...")
  const framer = await connect(PROJECT_URL, API_KEY)

  try {
    const collections = await framer.getCollections()

    // ── 1. Coleção Blog ────────────────────────────────────────────────────
    const blogCollection = collections.find(c => c.name?.toLowerCase() === "blog")
    if (!blogCollection) {
      throw new Error(`Coleção 'Blog' não encontrada. Disponíveis: ${collections.map(c => c.name).join(", ")}`)
    }

    // ── 2. Coleção Categorias → mapa slug → nome ──────────────────────────
    console.log("🏷️  Resolvendo categorias...")
    const catCollection = collections.find(c => c.name?.toLowerCase() === "categorias")
    const slugToName = {}

    if (catCollection) {
      const catFields  = await catCollection.getFields()
      const titleField = catFields.find(f => f.name.toLowerCase() === "title")
      const catItems   = await catCollection.getItems()

      for (const catItem of catItems) {
        const slug = catItem.slug ?? ""
        const nameVal = titleField ? catItem.fieldData?.[titleField.id]?.value : null
        if (slug) slugToName[slug] = nameVal ?? slug
      }
      console.log(`   Categorias mapeadas: ${Object.keys(slugToName).join(", ")}`)
    }

    // ── 3. Mapear campos do Blog (ID → nome) ──────────────────────────────
    console.log("🗺️  Mapeando campos do Blog...")
    const fields   = await blogCollection.getFields()
    const fieldMap = {}
    for (const field of fields) {
      fieldMap[field.id] = field.name
    }

    // ── 4. Buscar e montar posts ───────────────────────────────────────────
    console.log("📝 Buscando posts...")
    const items = await blogCollection.getItems()
    console.log(`   ${items.length} post(s) encontrado(s)\n`)

    const posts = []

    for (const item of items) {
      const data = item.fieldData ?? {}

      function getField(targetName) {
        for (const [id, name] of Object.entries(fieldMap)) {
          if (name.toLowerCase() === targetName.toLowerCase()) {
            return data[id]?.value ?? null
          }
        }
        return null
      }

      // Título
      const title = (getField("title") ?? getField("titulo") ?? item.slug ?? "").trim()

      // Slug / Link
      const slug = item.slug ?? ""
      const link = slug ? `${SITE_BASE}${BLOG_PREFIX}/${slug}` : null

      // Imagem
      let image = null
      const rawImage = getField("image") ?? getField("imagem")
      if (rawImage) {
        image = typeof rawImage === "string"
          ? rawImage
          : rawImage?.url ?? rawImage?.src ?? rawImage?.originalImageUrl ?? null
      }

      // Categorias → resolve slug para nome legível
      let categories = []
      const rawCat = getField("categories") ?? getField("categorias")
      if (rawCat) {
        const slugs = Array.isArray(rawCat) ? rawCat : [rawCat]
        categories = slugs.map(s => {
          const str = typeof s === "string" ? s : s?.value ?? String(s)
          return { slug: str, name: slugToName[str] ?? str }
        })
      }

      // Data de publicação
      const date = getField("date") ?? getField("data") ?? null

      posts.push({ id: item.id, slug, title, link, image, categories, date })
      console.log(`   ✓ [${date?.slice(0,10) ?? "??"}] ${title}`)
    }

    // Ordena do mais recente para o mais antigo
    posts.sort((a, b) => new Date(b.date ?? 0) - new Date(a.date ?? 0))

    // ── 5. Salvar JSON ────────────────────────────────────────────────────
    const output = {
      updatedAt: new Date().toISOString(),
      total: posts.length,
      posts,
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8")
    console.log(`\n✅ "${OUTPUT_FILE}" gerado! (${posts.length} posts)`)

  } finally {
    await framer.disconnect()
  }
}

main().catch(err => { console.error("❌", err.message ?? err); process.exit(1) })
