import { describe, expect, it } from 'vitest';
import { normalizeShoppingResults } from './normalize';

const RAW = {
  shopping_results: [
    {
      position: 1,
      title: 'ArcticPro 12,000 BTU Smart Window AC',
      link: 'https://www.megastore.com/p/arcticpro-12k',
      source: 'MegaStore',
      price: '$329.99',
      extracted_price: 329.99,
      old_price: '$429.99',
      rating: 4.7,
      reviews: 2841,
      delivery: 'Free delivery by Wed, Jul 22',
      thumbnail: 'https://serpapi.example/thumb1.jpg',
      tag: 'SALE',
    },
    {
      position: 2,
      title: 'No-link item is dropped',
      source: 'Nowhere',
    },
    {
      position: 3,
      title: 'Paid-shipping item',
      product_link: 'https://shop.example.com/p/2',
      source: 'Shop',
      price: '$99.00',
      delivery: '$5.99 delivery by Fri',
    },
  ],
};

describe('SerpApi shopping normalization', () => {
  const results = normalizeShoppingResults(RAW);

  it('maps fields into template product shape', () => {
    expect(results[0]).toMatchObject({
      title: 'ArcticPro 12,000 BTU Smart Window AC',
      link: 'https://www.megastore.com/p/arcticpro-12k',
      store_name: 'MegaStore',
      price: '$329.99',
      compare_price: '$429.99',
      rating: 4.7,
      review_count: 2841,
      delivery_time: 'Free delivery by Wed, Jul 22',
      shipping_cost: 'Free delivery',
      badge: 'SALE',
    });
  });

  it('drops items without a link and falls back to product_link', () => {
    expect(results).toHaveLength(2);
    expect(results[1].link).toBe('https://shop.example.com/p/2');
  });

  it('does not mark paid shipping as free', () => {
    expect(results[1].shipping_cost).toBeNull();
    expect(results[1].delivery_time).toBe('$5.99 delivery by Fri');
  });

  it('handles empty payloads', () => {
    expect(normalizeShoppingResults({})).toEqual([]);
    expect(normalizeShoppingResults(null)).toEqual([]);
  });
});
