# Mobile-Safe Controls

Compact, touch-friendly UI primitives that replace the old "big pill / button-card / stat card" patterns. All components live in `components/ui/` and are exported from `@/components/ui`.

## When to use

| Old pattern | Replace with | Why |
|---|---|---|
| Large pill tabs (`px-6 py-4`, `rounded-2xl`) | `<SegmentedControl />` | Compact h-9/h-10, proper `role="radiogroup"`, 44px touch target via wrapper |
| Oversized stat cards (`p-4 md:p-6`, `rounded-xl`) | `<StatChip />` | Min-height 44px but visually tight; grid-friendly |
| Big progress/goal bars in fat containers | `<ProgressInline />` | Thin h-2 bar, optional label row, no wrapper bloat |
| Icon buttons smaller than 44px or too large | `<IconAction />` | Exactly 44x44 tap area, ghost/outline variants |

## Component API

### `<SegmentedControl />`
```tsx
<SegmentedControl
  options={[
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ]}
  value={mode}
  onChange={setMode}
  size="sm"        // 'sm' (h-9) | 'md' (h-10)
  fullWidth={true}  // stretches to container
/>
```

### `<StatChip />`
```tsx
<StatChip label="To Post" value={5} icon={<Send className="w-3 h-3" />} size="sm" />
```

### `<ProgressInline />`
```tsx
<ProgressInline value={65} label="Weekly goal" sublabel="65%" intent="teal" />
```
Intents: `teal` | `amber` | `red` | `neutral`

### `<IconAction />`
```tsx
<IconAction icon={<RefreshCw className="w-4 h-4" />} aria-label="Refresh" variant="ghost" />
```
Variants: `ghost` (no border) | `outline` (zinc border)

## Design rules

1. **44px touch targets** — all interactive elements meet this minimum on mobile.
2. **Compact visuals** — small text (`text-xs`/`text-sm`), tight padding, no `py-4`+ on controls.
3. **Dark-mode native** — zinc-800/900 backgrounds, teal accents.
4. **No "big pill" styling** — avoid `rounded-2xl`, `px-6 py-4`, oversized stat blocks.
5. **Desktop unchanged** — responsive props (`md:` / `lg:`) let desktop stay spacious.
