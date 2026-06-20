# Firecrawl AI Workflow

Use this guide to combine Firecrawl with Claude, Codex, or any local AI workflow for website research, redesign planning, copy generation, and InstantDesk chatbot knowledge base creation.

This repository also includes a local `/firecrawl-test` page for manual scraping and reporting. Keep that page for quick checks; use the workflows below when you want repeatable AI-assisted analysis.

## Prerequisites

1. Create or keep a Firecrawl API key.
2. Add the key to your local environment as `FIRECRAWL_API_KEY`.
3. If using Firecrawl MCP with Claude or another MCP-enabled client, configure the Firecrawl MCP server in that client and pass the API key through the MCP server environment.
4. If using Codex inside this repo, use the existing `/firecrawl-test` page or ask Codex to call the Firecrawl-backed API route when local network/API access is available.

## Recommended Workflow

1. Scrape the homepage first.
2. Crawl the full website with a small page limit, usually 10-25 pages.
3. Extract sitemap/page structure from discovered URLs.
4. Analyze key conversion sections: hero, CTAs, headings, services, pricing, testimonials, lead capture, trust signals, and SEO.
5. Ask the AI for recommendations grounded only in the scraped evidence.
6. Generate new copy, landing page structure, or chatbot knowledge base content.
7. Save final outputs into project docs, InstantDesk knowledge base records, or client handoff files.

## 1. Analyze Competitor Websites

Use Firecrawl to scrape or crawl competitor websites, then ask the AI to compare positioning, conversion flow, offers, pricing, and trust signals.

Focus on:

- Target audience
- Main promise
- Hero headline and subheadline
- Primary and secondary CTAs
- Services or product categories
- Pricing structure
- Testimonials and proof
- Lead capture paths
- SEO title, meta description, and heading structure
- Differentiation opportunities for InstantDesk or the client

Example prompt:

```text
Use Firecrawl to crawl this competitor website: https://example.com

Analyze the site for:
- Positioning
- Hero headline and subheadline
- Primary and secondary CTAs
- Navigation structure
- Services/products offered
- Pricing or package structure
- Testimonials, logos, reviews, and trust indicators
- Lead capture methods
- SEO title, meta description, and heading hierarchy

Then produce:
1. Competitor summary
2. Strengths
3. Weaknesses
4. Opportunities for us to outperform them
5. Recommended homepage structure for a better competing website
```

## 2. Extract Sitemap And Page Structure

Use Firecrawl crawl mode to discover key pages. Keep the crawl limit controlled so the output stays useful.

Capture:

- URL
- Page title
- H1
- Main topic
- Page type: homepage, service page, pricing page, blog, contact, about, FAQ, legal
- Important internal links

Example prompt:

```text
Use Firecrawl to crawl this website with a limit of 25 pages: https://example.com

Create a sitemap report with:
- URL
- Page title
- H1
- Page type
- Main user intent
- Important internal links

Then group the pages into:
- Core conversion pages
- Service/product pages
- Trust/proof pages
- Blog/resources
- Legal/utility pages

Finally, identify missing pages that would improve conversion and SEO.
```

## 3. Extract Hero Sections, CTAs, Headings, Services, Pricing, Testimonials

For a focused conversion audit, scrape the homepage plus key service/pricing pages.

Extract:

- Hero headline
- Hero subheadline
- Primary CTA
- Secondary CTA
- H1-H3 structure
- Services and features
- Pricing tiers
- Testimonials
- Logos
- Trust indicators
- Forms, booking widgets, phone numbers, emails, chat widgets

Example prompt:

```text
Use Firecrawl to scrape these pages:
- https://example.com
- https://example.com/services
- https://example.com/pricing

Extract a structured report:

Hero:
- Headline
- Subheadline
- Primary CTA
- Secondary CTA

Navigation:
- Menu items

Content:
- H1-H3 heading structure
- Services/features
- Pricing tiers and inclusions
- Testimonials
- Logos/trust indicators

Lead capture:
- Forms
- Booking widgets
- Contact options
- Chat widgets

Return the result as clean Markdown tables.
```

## 4. Generate Redesign Recommendations

Use the extracted evidence to generate a redesign plan. Do not let the AI invent facts; recommendations should reference the scraped content.

Example prompt:

```text
Using the Firecrawl analysis above, create a redesign strategy for this website.

Include:
1. Best current conversion assets to keep
2. Weak sections to rewrite or remove
3. New homepage wireframe
4. Improved hero headline, subheadline, and CTAs
5. Better section order
6. Social proof improvements
7. Lead capture improvements
8. SEO improvements
9. Mobile UX improvements
10. Priority list: quick wins, medium effort, high-impact rebuild items

Ground every recommendation in the scraped website evidence. If evidence is missing, say what needs to be verified.
```

## 5. Generate Website Copy

After scraping a client or competitor site, ask the AI to create sharper copy from the extracted services, audience, proof, and offer.

Example prompt:

```text
Using the Firecrawl website analysis below, write new homepage copy.

Requirements:
- Premium SaaS style
- Clear, conversion-focused language
- No exaggerated claims unless supported by the scraped evidence
- Keep the offer specific
- Include one primary CTA and one secondary CTA

Create:
1. Hero headline
2. Hero subheadline
3. Primary CTA
4. Secondary CTA
5. Problem section
6. Services/features section
7. How it works section
8. Social proof section
9. FAQ section
10. Final CTA section

Also provide 3 alternative hero versions with different angles:
- Direct ROI angle
- Speed/convenience angle
- Trust/professionalism angle
```

## 6. Generate InstantDesk Chatbot Knowledge Base From A Client Website

Use Firecrawl to crawl the client website, then convert the extracted content into chatbot-ready knowledge.

The knowledge base should include:

- Business overview
- Services
- Pricing, if public
- Locations served
- Opening hours
- Contact details
- Booking process
- FAQs
- Policies
- What the chatbot should say when information is missing
- Escalation and handover rules

Example prompt:

```text
Use Firecrawl to crawl this client website with a limit of 25 pages: https://client-site.com

Create an InstantDesk chatbot knowledge base from the scraped content.

Return:
1. Business summary
2. Services offered
3. Pricing or packages, only if found
4. Locations served
5. Opening hours
6. Contact details
7. Booking process
8. Frequently asked questions and answers
9. Lead qualification questions
10. Recommended chatbot tone
11. Human handover triggers
12. Unknown-answer fallback response

Rules:
- Do not invent facts.
- If something is not found, mark it as "Not found on website".
- Keep answers concise enough for a website chatbot.
- Include source URLs for important facts.
```

## Claude/Codex Prompt Templates

### Full Website Audit

```text
Use Firecrawl to crawl: [URL]

Analyze the website and produce a complete conversion report:
- Hero section: headline, subheadline, primary CTA, secondary CTA
- Navigation menu items
- Social proof: logos, testimonials, reviews, trust indicators
- Lead capture: forms, booking widgets, phone/email/chat/contact paths
- Design: color palette, button styles, layout patterns
- SEO: title, meta description, H1-H3 structure
- Services/products
- Pricing

Then generate:
- Strengths
- Weaknesses
- Opportunities
- Recommendations
- Improved homepage structure
- Improved hero copy
```

### Competitor Comparison

```text
Use Firecrawl to analyze these competitor websites:
1. [URL 1]
2. [URL 2]
3. [URL 3]

Compare:
- Positioning
- Offer clarity
- Hero copy
- CTAs
- Services
- Pricing
- Proof/trust signals
- Lead capture flow
- SEO structure

Then recommend how our website can beat them with clearer positioning, stronger conversion flow, better proof, and sharper copy.
```

### Client Website To Chatbot Knowledge Base

```text
Use Firecrawl to crawl this client website: [URL]

Turn the content into an InstantDesk chatbot knowledge base.

Format:
- Business overview
- Services
- Booking instructions
- Pricing
- Contact information
- Locations
- Hours
- FAQs
- Lead qualification questions
- Handover triggers
- Fallback answers
- Source URLs

Do not invent missing facts. Mark missing data clearly.
```

### Landing Page Rewrite

```text
Use Firecrawl to scrape this website: [URL]

Based on the scraped content, write a better landing page.

Deliver:
- New hero headline
- New hero subheadline
- Primary CTA
- Secondary CTA
- Section-by-section homepage outline
- Copy for each section
- FAQ
- Final CTA
- SEO title
- Meta description

Style:
- Clear
- Premium
- Specific
- Conversion-focused
- No unsupported claims
```

## Quality Checklist

Before using Firecrawl output for client work, verify:

- The crawl included all important pages.
- Pricing and policies are current.
- Phone numbers, emails, and hours are correct.
- AI recommendations are based on scraped evidence.
- Any missing facts are marked as missing, not invented.
- Generated chatbot answers are short and safe for customer-facing use.
- Human handover triggers are included when the chatbot cannot answer.
