# Knowledge Retrieval and RAG

| Field | Value |
|---|---|
| Document ID | BASHA-RAG-004 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | PARTIAL. Original RAG paper verified (S32). PostgreSQL full-text/vector documentation, retrieval-evaluation studies and reranking literature NOT yet read: the choices below are engineering proposals, not research findings. |

## Verified source
**S32:** Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", arXiv 2005.11401, submitted 22 May 2020 (v4 revised 12 April 2021), NeurIPS 2020. Combines a pre-trained seq2seq model with a dense vector index of Wikipedia via a neural retriever; reports state-of-the-art on three open-domain QA tasks and more "specific, diverse and factual" generation than a parametric-only baseline. The abstract states provenance and updating knowledge remain open problems. Limitations of RAG (retrieval errors, cost) were not discussed in the excerpt read; independent reproduction was not checked.

## Goal
Find the right procedure for a task without loading every file: this library is split into one-topic files with metadata so retrieval stays small.

## Proposed design [PROPOSED]
1. **Start with metadata + keyword retrieval.** Each document has frontmatter: id, module, tasks supported, tools, labels, last_reviewed, source IDs. For a library of tens to hundreds of files, a table lookup by task/tool plus PostgreSQL full-text search is likely enough; **a vector database is not mandatory**. Add embeddings only if measured recall on real queries is poor.
2. **Chunk by section** (e.g. "Detection", "Decision rules"), keep the document title and ID with each chunk.
3. **Hybrid retrieval** (keyword + semantic) is an option once measured; rerank only if evaluation shows gains.
4. **Always cite**: each retrieved chunk carries doc ID and source IDs; the agent states which doc supported a decision.
5. **Freshness:** each chunk has `last_reviewed` and `volatile` flags (APIs, limits, policies). If volatile and older than the review window, the agent must tell the user the information may be outdated or re-check the source.
6. **Tenant knowledge** (brand voice, product facts, uploaded documents) lives in a separate, tenant-scoped index with access control applied **before** retrieval, never after.
7. **Injection safety:** retrieved text is data (see SECURITY/04). Tenant uploads cannot override system or operating rules.
8. **Context budget:** retrieve top-k small chunks (start k=4 to 6, tune), not whole files.

## Evaluation
Build a labelled set of 100+ real task queries with the expected document(s); report recall@k, citation accuracy (does the cited doc contain the claim), stale-answer rate, and answer groundedness. No target numbers are claimed here.

## Maintenance
Re-index on every change; version the index with the library version; keep a changelog.

## Limitations
No evidence in this library about the best embedding model, chunk size or reranker for SEO documents.

## Sources
S32; internal design.
