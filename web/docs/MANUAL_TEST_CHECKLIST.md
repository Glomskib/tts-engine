# FlashFlow AI - Manual Test Checklist

## Authentication
- [ ] Sign up with email
- [ ] Login with email
- [ ] Google OAuth login
- [ ] Logout
- [ ] Password reset flow
- [ ] Redirect to login when unauthenticated

## Content Studio (Script Generator)
- [ ] Select product from dropdown
- [ ] Select persona
- [ ] Adjust creative controls (tone, intensity, length)
- [ ] Generate script - completes successfully
- [ ] Script displays with all sections (hook, body, CTA, B-roll)
- [ ] Save to library
- [ ] Refine existing script
- [ ] Mark script as winner
- [ ] Pain point checklist displays (if product has pain points)
- [ ] Export script (copy/download)

## Products & Brands
- [ ] Create brand with all fields
- [ ] Create product linked to brand
- [ ] Auto-generate pain points via AI
- [ ] Pain points display on product card
- [ ] Edit product details
- [ ] Delete product
- [ ] Brand dropdown populates in product form

## Audience Personas
- [ ] View personas list
- [ ] Archetype names display (not human names)
- [ ] Create new persona with archetype name
- [ ] Edit persona
- [ ] Persona selection works in script generator

## Video Pipeline (Agency tier)
- [ ] Create new video from product
- [ ] Video appears in correct status column
- [ ] Change video status through workflow
- [ ] Open video detail drawer
- [ ] Filter by status tabs
- [ ] Filter by role (recorder/editor/uploader)
- [ ] Search by video code
- [ ] Claim/release video
- [ ] Board (Kanban) view displays correctly
- [ ] NEEDS_SCRIPT and GENERATING_SCRIPT states work

## Winners Bank
- [ ] Add external winner (URL)
- [ ] Save from generated script
- [ ] AI analysis generates insights
- [ ] View winner details
- [ ] "Generate Similar" creates new script

## Content Calendar
- [ ] Calendar loads with skeleton then data
- [ ] Schedule new post (title, time, platform)
- [ ] Edit scheduled post
- [ ] Delete post with confirmation
- [ ] Navigate between months
- [ ] Today button works
- [ ] Platform filter works
- [ ] Post count displays
- [ ] Toast notifications appear for save/delete

## Analytics Dashboard
- [ ] Page loads without error
- [ ] Stats cards display data
- [ ] Time period filter works

## Settings
- [ ] Account tab shows user info
- [ ] Subscription tab shows current plan
- [ ] Credits remaining displayed
- [ ] Usage bar renders correctly
- [ ] Manage Billing button opens Stripe portal
- [ ] Buy Credits section loads credit packs
- [ ] Notifications tab toggles work
- [ ] Preferences tab (theme, defaults) saves

## Billing & Credits
- [ ] Credits badge shows in header (desktop)
- [ ] Credits badge shows in header (mobile, compact)
- [ ] Low credit banner appears when credits <= 5
- [ ] No credits modal appears when credits = 0
- [ ] Upgrade page loads with all SaaS tiers
- [ ] Upgrade page loads with all Video tiers
- [ ] Monthly/yearly toggle changes prices
- [ ] Subscribe button initiates Stripe checkout
- [ ] Feature gate blocks locked features with upgrade prompt

## Landing Page
- [ ] All sections render (hero, problem, features, pricing, FAQ, CTA)
- [ ] Navigation links scroll to sections
- [ ] "How It Works" link works
- [ ] Social proof metrics bar displays
- [ ] Pricing section shows correct tiers
- [ ] Monthly/yearly toggle works
- [ ] CTAs link to signup
- [ ] Video services section renders
- [ ] Contact form modal works
- [ ] Footer links work

## Mobile Responsive
- [ ] Landing page - all sections stack properly
- [ ] Content Studio - usable on mobile
- [ ] Pipeline - mobile list view works
- [ ] Calendar - cells readable on mobile
- [ ] Navigation - sidebar opens/closes
- [ ] Bottom nav - all links work
- [ ] Modals - full width on mobile
- [ ] Credits badge - compact version displays

## Navigation
- [ ] Sidebar renders correct sections based on plan
- [ ] Admin sees all sections
- [ ] Free user sees limited sections
- [ ] Active page highlighted in sidebar
- [ ] Mobile bottom nav shows correct items
