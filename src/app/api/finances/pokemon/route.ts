import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// PriceCharting URLs for each card
const CARD_URLS: Record<string, string> = {
  'charizard-4': 'https://www.pricecharting.com/game/pokemon-base-set-shadowless/charizard-4',
  'blastoise-2': 'https://www.pricecharting.com/game/pokemon-base-set-shadowless/blastoise-2',
  'venusaur-15': 'https://www.pricecharting.com/game/pokemon-base-set-shadowless/venusaur-15',
  'squirtle-63': 'https://www.pricecharting.com/game/pokemon-base-set-shadowless/squirtle-63',
  'bulbasaur-44': 'https://www.pricecharting.com/game/pokemon-base-set-shadowless/bulbasaur-44',
  'charmander-46': 'https://www.pricecharting.com/game/pokemon-base-set-shadowless/charmander-46',
  'wartortle-42': 'https://www.pricecharting.com/game/pokemon-base-set-shadowless/wartortle-42',
  'charmeleon-24': 'https://www.pricecharting.com/game/pokemon-base-set-shadowless/charmeleon-24',
  'ivysaur-30': 'https://www.pricecharting.com/game/pokemon-base-set-shadowless/ivysaur-30',
};

// Map card ID to PSA grade for price extraction
const CARD_GRADES: Record<string, string> = {
  'charizard-4': 'PSA 8',
  'blastoise-2': 'PSA 9',
  'venusaur-15': 'PSA 9',
  'squirtle-63': 'PSA 10',
  'bulbasaur-44': 'PSA 9',
  'charmander-46': 'PSA 10',
  'wartortle-42': 'PSA 10',
  'charmeleon-24': 'PSA 10',
  'ivysaur-30': 'PSA 10',
};

// Parse price from PriceCharting HTML
function extractGradedPrice(html: string, grade: string): number | null {
  try {
    // PriceCharting shows graded prices in a table with class "grade-prices"
    // Look for the specific PSA grade row and extract the price
    const gradeNumber = grade.replace('PSA ', '');

    // Try multiple patterns
    // Pattern 1: "PSA X" followed by price in the graded prices section
    const patterns = [
      // Table format: <td>PSA 10</td><td class="price">$XXX.XX</td>
      new RegExp(`PSA\\s*${gradeNumber}[^$]*?\\$([\\d,]+\\.?\\d*)`, 'i'),
      // Alternative: grade-X price
      new RegExp(`grade-${gradeNumber}[^$]*?\\$([\\d,]+\\.?\\d*)`, 'i'),
      // Alternative: "graded" section with price
      new RegExp(`"graded[^"]*"[^$]*?\\$([\\d,]+\\.?\\d*)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(',', ''));
      }
    }

    // Fallback: look for any "graded-price" or similar
    const gradedMatch = html.match(/graded.*?\$([\\d,]+\.?\d*)/i);
    if (gradedMatch) {
      return parseFloat(gradedMatch[1].replace(',', ''));
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  const results: Record<string, { price: number | null; grade: string; url: string }> = {};

  // Fetch prices for each card (sequentially to be polite)
  for (const [cardId, url] of Object.entries(CARD_URLS)) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PriceCheck/1.0)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const html = await res.text();
        const grade = CARD_GRADES[cardId] || 'PSA 10';
        const price = extractGradedPrice(html, grade);
        results[cardId] = { price, grade, url };
      } else {
        results[cardId] = { price: null, grade: CARD_GRADES[cardId] || 'PSA 10', url };
      }

      // Be polite: wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch {
      results[cardId] = { price: null, grade: CARD_GRADES[cardId] || 'PSA 10', url };
    }
  }

  return NextResponse.json({
    results,
    fetchedAt: new Date().toISOString(),
    note: 'Prices scraped from PriceCharting.com. May need manual verification.',
  });
}
