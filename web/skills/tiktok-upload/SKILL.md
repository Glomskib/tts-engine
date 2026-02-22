# TikTok Upload Skill

Upload a video to TikTok Shop with product linking.

## Prerequisites

- Video must be in `ready_to_post` status
- Video must have a `final_video_url`
- A TikTok product ID must be resolvable (see Product Linking below)

## Workflow

1. Run `pnpm run publish:pack -- --video-id <uuid>` to generate the upload pack
2. Open the output folder (`~/FlashFlowUploads/YYYY-MM-DD/<lane>/<slug>/`)
3. Follow `checklist.md` for step-by-step upload instructions
4. Use `product.txt` for TikTok Shop product linking

## Product Linking

The upload pack resolves `tiktok_product_id` in this order:

1. **Direct on video/script** — `script_locked_json.tiktok_product_id`
2. **Products table** — `video.product_id` -> `products.tiktok_product_id`
3. **FF Products lookup** — `script_locked_json.product_key` -> `ff_products.key` -> `tiktok_product_id`

If none resolve, the pack returns `missing_product_id` error.

### Managing FF Products

```bash
# Create / update a product mapping
curl -X POST /api/flashflow/products \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"key":"mushroom-gummies","display_name":"Mushroom Gummies","tiktok_product_id":"123456789"}'

# Search products
curl "/api/flashflow/products?q=mushroom" \
  -H "Authorization: Bearer $TOKEN"
```

## Product linking by product_id search in TikTok Studio

When posting from your phone in TikTok Studio:

1. Open the video upload screen
2. Tap "Add product" or "TikTok Shop"
3. Search for the product using the `tiktok_product_id` from `product.txt`
4. Select the matching product to link it to your video
5. Complete the post

## Files in Upload Pack

| File | Contents |
|------|----------|
| `video.mp4` | The final video file |
| `caption.txt` | TikTok caption text |
| `hashtags.txt` | Hashtags (space-separated) |
| `hook.txt` | Opening hook line |
| `cta.txt` | Call to action |
| `cover.txt` | Cover/thumbnail text overlay |
| `product.txt` | Product display name + TikTok product ID |
| `checklist.md` | Step-by-step upload checklist |
| `metadata.json` | Full upload pack as JSON (includes product block) |
