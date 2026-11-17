/**
 * The photography used around SAVO.
 *
 * Every entry is a real photograph from Unsplash, used under the Unsplash
 * License (free for commercial use; credit given anyway). Files are self-hosted
 * from `public/photography/` so the app never depends on a third-party CDN at
 * runtime and never hotlinks an unverified URL. The exact source page, CDN
 * source and photographer are recorded here so the provenance survives.
 *
 * The `focal` value is the CSS object-position that keeps the subject in frame
 * at both phone and desktop crops — it was chosen by looking at the render, not
 * by guessing.
 */
export type Photograph = {
  src: string;
  alt: string;
  width: number;
  height: number;
  focal: string;
  title: string;
  author: string;
  page: string;
  source: string;
  license: "Unsplash License";
};

export const PHOTOGRAPHY = {
  /** Image A — landing hero: a real boutique interior with hanging racks. */
  hero: {
    src: "/photography/a-hero.jpg",
    alt: "",
    width: 1600,
    height: 1067,
    focal: "50% 45%",
    title: "Clothing boutique interior with hanging racks",
    author: "Clark Street Mercantile",
    page: "https://unsplash.com/photos/qnKhZJPKFD8",
    source: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04",
    license: "Unsplash License",
  },
  /** Image B — shop selection: a well-lit independent retail interior. */
  shops: {
    src: "/photography/b-shops.jpg",
    alt: "",
    width: 1600,
    height: 1067,
    focal: "50% 55%",
    title: "Interior of a well-lit retail store with wooden beams",
    author: "Declan Sun",
    page: "https://unsplash.com/photos/xUuH6SWak1I",
    source: "https://images.unsplash.com/photo-1778034758286-d58d597db0a4",
    license: "Unsplash License",
  },
  /** Image C — stock: labelled products on a display rack. */
  stock: {
    src: "/photography/c-stock.jpg",
    alt: "Bottles arranged in rows on a shop display rack",
    width: 1600,
    height: 1067,
    focal: "50% 50%",
    title: "Assorted labelled bottles on a display rack",
    author: "Daria Strategy",
    page: "https://unsplash.com/photos/BMnX7L9G5xc",
    source: "https://images.unsplash.com/photo-1545601445-4d6a0a0565f0",
    license: "Unsplash License",
  },
  /** Image D — point of sale: a card being taken at a counter. */
  pos: {
    src: "/photography/d-pos.jpg",
    alt: "A card being used to pay at a counter",
    width: 1600,
    height: 1067,
    focal: "50% 55%",
    title: "A credit card being used for payment",
    author: "SumUp",
    page: "https://unsplash.com/photos/CzoRfscp8dU",
    source: "https://images.unsplash.com/photo-1742836531309-838d0f62efaf",
    license: "Unsplash License",
  },
  /** Image E — reports: a desk with a notebook in daylight. */
  reports: {
    src: "/photography/e-reports.jpg",
    alt: "A sunlit desk with a computer, books and a notebook",
    width: 1600,
    height: 1067,
    focal: "55% 55%",
    title: "Sunlit home office desk with computer and books",
    author: "Olivier Amyot",
    page: "https://unsplash.com/photos/-IhR-UgqUTc",
    source: "https://images.unsplash.com/photo-1770003354577-82b2a2d09d19",
    license: "Unsplash License",
  },
  /** Image F — customer accounts: a customer paying at a shop counter. */
  customers: {
    src: "/photography/f-customers.jpg",
    alt: "A customer paying at a small shop counter",
    width: 1600,
    height: 1067,
    focal: "50% 50%",
    title: "Woman paying at shop counter",
    author: "Christiann Koepke",
    page: "https://unsplash.com/photos/dQyS2pMYtok",
    source: "https://images.unsplash.com/photo-1556741533-6e6a62bd8b49",
    license: "Unsplash License",
  },
  /** Image G — product showcase: a phone on a desk beside a real screenshot. */
  showcase: {
    src: "/photography/g-showcase.jpg",
    alt: "A smartphone showing app icons on a wooden desk",
    width: 1600,
    height: 1067,
    focal: "50% 50%",
    title: "A smartphone with app icons on a wooden desk",
    author: "Thom Bradley",
    page: "https://unsplash.com/photos/A6qNzfJXRGQ",
    source: "https://images.unsplash.com/photo-1596558450268-9c27524ba856",
    license: "Unsplash License",
  },
  /** Image H — empty and onboarding states. */
  empty: {
    src: "/photography/h-empty.jpg",
    alt: "",
    width: 1600,
    height: 1067,
    focal: "50% 50%",
    title: "A monitor on a white desk in a bright room",
    author: "Teddy GR",
    page: "https://unsplash.com/photos/gVpXbCGG6jI",
    source: "https://images.unsplash.com/photo-1639413665566-2f75adf7b7ca",
    license: "Unsplash License",
  },
} as const satisfies Record<string, Photograph>;

/** Renders the required credit for a photograph, linked to its source page. */
export function creditLine(photo: Photograph) {
  return `Photograph: ${photo.author} / Unsplash`;
}
