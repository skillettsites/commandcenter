# Morning Page Structure Audit

Run this as part of the daily morning auto-research routine. The goal is to find the highest-traffic pages across all sites and ensure they have optimal structure for conversions, SEO, and user engagement.

## Steps

### 1. Trigger the page audit API
Call the CommandCenter page audit endpoint to scan all sites:

```
POST https://commandcenter-mocha.vercel.app/api/autoresearch/page-audit
Content-Type: application/json
Body: {}
```

This will:
- Fetch the top pages by traffic from GSC for each site
- Crawl each page and check for structural elements
- Store results in the `page_audits` Supabase table
- Return a summary of issues found

### 2. Review the results
Fetch the latest audit results:

```
GET https://commandcenter-mocha.vercel.app/api/autoresearch/page-audit
```

### 3. Prioritize fixes by impact
Focus on pages that have the highest traffic AND the most issues. Specifically look for:

**High priority (revenue impact):**
- Pages with 10+ monthly clicks that are missing affiliate CTAs (bestlondontours, thebesttours, findyourstay, helpafterloss, helpafterlife, carcostcheck)
- Data tables buried below the fold on data-heavy sites (postcodecheck, carcostcheck, tapwaterscore, medcostcheck)

**Medium priority (SEO impact):**
- Pages missing JSON-LD structured data
- Pages with thin content (under 300 words)
- Pages missing H1 tags or with multiple H1s
- Pages with fewer than 3 internal links

**Lower priority (polish):**
- Missing Open Graph tags
- Missing meta descriptions
- No images on the page

### 4. Generate fix instructions
For each page with issues, generate specific, actionable instructions. Examples:

- "bestlondontours.co.uk/tours/tower-of-london-tickets: Add a GetYourGuide affiliate CTA button below the tour description. Use partner_id=LPT26IL."
- "postcodecheck.co.uk/area/london: Move the area stats table above the descriptive text. Key data (crime rate, avg price, school rating) should be visible without scrolling."
- "carcostcheck.co.uk/car/ford-fiesta: Add Article schema with JSON-LD. Include make, model, year, and price data in the structured data."

### 5. Create tasks in CommandCenter
For each fix, create a task in the CommandCenter tasks table:

```
POST https://commandcenter-mocha.vercel.app/api/tasks
{
  "project": "<site-id>",
  "description": "<specific fix instruction>",
  "status": "pending",
  "priority": "high"  // or "medium" based on traffic impact
}
```

### 6. Report summary
After completing the audit, produce a summary like:

```
Morning Page Audit - [date]
Sites scanned: 13
Pages audited: 87
Average score: 72/100
Pages needing work: 23
Top issues:
  - 15 pages missing structured data
  - 8 pages missing affiliate CTAs
  - 5 pages with thin content
  - 3 pages with buried data tables
Tasks created: 12
```

## Sites to monitor
- carcostcheck.co.uk
- postcodecheck.co.uk
- bestlondontours.co.uk
- the-best-tours.com
- helpafterloss.co.uk
- helpafterlife.com
- daveknowsai.com
- findyourstay.com
- aicareerswap.com
- askyourstay.com
- aibetfinder.com
- tapwaterscore.vercel.app
- medcostcheck.vercel.app

## Site-specific optimization rules

### Affiliate sites (bestlondontours, thebesttours, findyourstay, helpafterloss, helpafterlife, carcostcheck)
Every page with 5+ monthly clicks MUST have at least one affiliate CTA. Check for:
- GetYourGuide links (partner_id=LPT26IL) on tour/activity pages
- Booking.com or Expedia links on accommodation pages
- Amazon Associates links on product recommendation pages
- Relevant service affiliate links (BetterHelp, Confused.com, etc.)

### Data sites (postcodecheck, carcostcheck, tapwaterscore, medcostcheck)
Key data should be visible within the first viewport (above the fold):
- Data tables or stat cards should appear in the top third of the page
- Long introductory text should be shortened or collapsed
- Use expandable sections for secondary information

### Content sites (daveknowsai, aicareerswap, helpafterloss, helpafterlife)
Every page should have:
- JSON-LD structured data (Article, FAQPage, or BreadcrumbList)
- At least one image with descriptive alt text
- H1 tag matching the page title
- 5+ internal links to related content
- 500+ words of substantive content

### SaaS sites (aibetfinder, askyourstay)
Landing and feature pages should have:
- Clear CTA buttons (sign up, start free trial)
- Social proof or trust signals
- FAQ section with FAQPage schema
- Product or SoftwareApplication schema
