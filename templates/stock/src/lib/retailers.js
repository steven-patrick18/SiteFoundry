// Curated directory of major US online retailers. Contact details here are
// publicly listed customer-service numbers, corporate headquarters, and
// official websites — the kind of information shoppers search for ("Walmart
// customer service number", "how to contact Target"). Every store page shows
// a disclaimer and links to the official site so visitors can verify, because
// published numbers and hours do change over time.
//
// Each record drives one /store/<slug>/ page plus the home directory. Keep
// entries factual and generic; no affiliate or pricing claims.

/** URL-safe slug from a store name. */
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const RAW = [
  {
    name: 'Amazon',
    url: 'https://www.amazon.com',
    category: 'Marketplace',
    tagline: "Earth's largest online store — from books to electronics to groceries.",
    founded: 1994,
    hq: 'Seattle, Washington',
    phone: '1-888-280-4331',
    hours: '24 hours a day, 7 days a week',
    sells: ['Electronics', 'Books', 'Home & Kitchen', 'Groceries', 'Clothing', 'Toys'],
    description:
      'Amazon is the largest online retailer in the United States, selling hundreds of millions of products across nearly every category imaginable. Founded in 1994 as an online bookstore, it has grown into a global marketplace where both Amazon and third-party sellers list items. Amazon Prime members get fast free shipping, streaming video and music, and exclusive deals. The company is also a leader in cloud computing, smart-home devices (Echo/Alexa), and same-day grocery delivery through Amazon Fresh and Whole Foods.',
  },
  {
    name: 'Walmart',
    url: 'https://www.walmart.com',
    category: 'General Retail',
    tagline: 'Everyday low prices on groceries, home, electronics and more.',
    founded: 1962,
    hq: 'Bentonville, Arkansas',
    phone: '1-800-925-6278',
    hours: 'Mon–Sun, 8am–11pm CT',
    sells: ['Groceries', 'Home', 'Electronics', 'Clothing', 'Pharmacy', 'Auto'],
    description:
      "Walmart is the world's largest retailer by revenue, serving millions of US customers both in stores and online at Walmart.com. It is known for everyday low prices across groceries, household essentials, electronics, apparel, and more. Walmart+ membership adds free shipping, free grocery delivery, fuel discounts, and mobile scan-and-go in stores. Online orders can be shipped, picked up curbside, or delivered same-day from a nearby store.",
  },
  {
    name: 'Target',
    url: 'https://www.target.com',
    category: 'General Retail',
    tagline: 'Style, home, and essentials with same-day pickup and delivery.',
    founded: 1962,
    hq: 'Minneapolis, Minnesota',
    phone: '1-800-440-0680',
    hours: 'Mon–Sun, 7am–10pm CT',
    sells: ['Home', 'Clothing', 'Groceries', 'Beauty', 'Toys', 'Electronics'],
    description:
      'Target is a popular US general-merchandise retailer known for its trend-forward home goods, apparel, and exclusive owned brands. Shoppers can buy online at Target.com with same-day services powered by Shipt and Drive Up curbside pickup. The Target Circle loyalty program offers personalized deals and earnings, while the Target RedCard gives 5% off most purchases. Target is a go-to for affordable style, seasonal decor, baby products, and everyday essentials.',
  },
  {
    name: 'Best Buy',
    url: 'https://www.bestbuy.com',
    category: 'Electronics',
    tagline: 'Consumer electronics, appliances, and Geek Squad tech support.',
    founded: 1966,
    hq: 'Richfield, Minnesota',
    phone: '1-888-237-8289',
    hours: 'Mon–Sun, 8am–9pm local',
    sells: ['Computers', 'TVs', 'Appliances', 'Phones', 'Gaming', 'Smart Home'],
    description:
      'Best Buy is the largest specialty consumer-electronics retailer in the United States, selling laptops, TVs, appliances, phones, cameras, and smart-home gear. Its Geek Squad service handles installation, repair, and tech support in-store, in-home, and remotely. My Best Buy membership tiers add free shipping, extended returns, and exclusive prices. Best Buy is known for price matching, open-box discounts, and knowledgeable in-store staff.',
  },
  {
    name: 'eBay',
    url: 'https://www.ebay.com',
    category: 'Marketplace',
    tagline: 'Buy and sell new and used items through auctions or fixed prices.',
    founded: 1995,
    hq: 'San Jose, California',
    phone: '1-866-540-3229',
    hours: 'Mon–Sun, 5am–10pm PT',
    sells: ['Collectibles', 'Electronics', 'Auto Parts', 'Fashion', 'Refurbished'],
    description:
      'eBay is a global online marketplace connecting individual and business sellers with buyers through both auction-style and fixed-price listings. It is especially popular for collectibles, refurbished electronics, car parts, and hard-to-find items. eBay Money Back Guarantee protects buyers if an item does not arrive or match its description. Authenticity Guarantee adds expert verification for sneakers, watches, handbags, and trading cards.',
  },
  {
    name: 'The Home Depot',
    url: 'https://www.homedepot.com',
    category: 'Home & Furniture',
    tagline: "The largest home-improvement retailer in the US.",
    founded: 1978,
    hq: 'Atlanta, Georgia',
    phone: '1-800-466-3337',
    hours: 'Mon–Sun, 6am–midnight ET',
    sells: ['Tools', 'Appliances', 'Lumber', 'Garden', 'Paint', 'Flooring'],
    description:
      'The Home Depot is the largest home-improvement retailer in the United States, serving DIYers and professional contractors alike. It sells tools, building materials, appliances, lumber, paint, plumbing, garden supplies, and more, with delivery and in-store or curbside pickup. The Pro Xtra loyalty program rewards trade customers, and the site offers tool rental, installation services, and how-to project guides.',
  },
  {
    name: "Lowe's",
    url: 'https://www.lowes.com',
    category: 'Home & Furniture',
    tagline: 'Home improvement, appliances, tools, and garden.',
    founded: 1921,
    hq: 'Mooresville, North Carolina',
    phone: '1-800-445-6937',
    hours: 'Mon–Sun, 8am–9pm local',
    sells: ['Appliances', 'Tools', 'Lumber', 'Garden', 'Lighting', 'Flooring'],
    description:
      "Lowe's is a leading US home-improvement chain offering appliances, tools, building materials, lawn and garden products, and installation services. Shoppers can order online at Lowes.com with delivery or free store pickup. The MyLowe's Rewards program provides member deals and perks, and Lowe's For Pros supports contractors with volume pricing and business tools.",
  },
  {
    name: 'Costco',
    url: 'https://www.costco.com',
    category: 'Warehouse Club',
    tagline: 'Members-only warehouse club with bulk savings.',
    founded: 1983,
    hq: 'Issaquah, Washington',
    phone: '1-800-774-2678',
    hours: 'Mon–Fri, 5am–8pm PT',
    sells: ['Groceries', 'Electronics', 'Appliances', 'Furniture', 'Travel', 'Pharmacy'],
    description:
      'Costco Wholesale is a membership warehouse club famous for bulk quantities and low prices on groceries, electronics, appliances, furniture, and more. Costco.com lets members shop online, including items not stocked in warehouses, plus same-day grocery via Instacart. Membership tiers (Gold Star and Executive) unlock warehouse access, gas discounts, and 2% annual rewards on Executive plans.',
  },
  {
    name: 'Wayfair',
    url: 'https://www.wayfair.com',
    category: 'Home & Furniture',
    tagline: 'A zillion things home — furniture and decor online.',
    founded: 2002,
    hq: 'Boston, Massachusetts',
    phone: '1-877-929-3247',
    hours: 'Mon–Sun, 8am–midnight ET',
    sells: ['Furniture', 'Decor', 'Rugs', 'Lighting', 'Outdoor', 'Kitchen'],
    description:
      'Wayfair is one of the largest online-only retailers of furniture and home goods in the US, offering millions of items across every style and budget. Its house brands — AllModern, Birch Lane, Joss & Main, and Perigold — span modern to luxury. Wayfair provides free shipping on many orders over a threshold, financing options, and frequent sale events like Way Day.',
  },
  {
    name: 'Newegg',
    url: 'https://www.newegg.com',
    category: 'Electronics',
    tagline: 'PC components, electronics, and gaming gear.',
    founded: 2001,
    hq: 'City of Industry, California',
    phone: '1-800-390-1119',
    hours: 'Mon–Sun, 5:30am–5:30pm PT',
    sells: ['PC Parts', 'Laptops', 'Gaming', 'Components', 'Networking'],
    description:
      'Newegg is a leading online retailer for computer hardware and consumer electronics, especially popular with PC builders and gamers. It carries CPUs, graphics cards, motherboards, storage, prebuilt PCs, and a broad electronics catalog, plus a marketplace of third-party sellers. Newegg is known for detailed spec listings, customer reviews, combo deals, and Shuffle drops for hard-to-find GPUs.',
  },
  {
    name: 'B&H Photo Video',
    url: 'https://www.bhphotovideo.com',
    category: 'Electronics',
    tagline: 'Photo, video, audio, and pro electronics superstore.',
    founded: 1973,
    hq: 'New York, New York',
    phone: '1-800-606-6969',
    hours: 'Sun–Thu, varies (closed Sat for Shabbos)',
    sells: ['Cameras', 'Lenses', 'Audio', 'Computers', 'Lighting', 'Pro Video'],
    description:
      'B&H Photo Video is a renowned New York superstore for photography, video, audio, and professional electronics. It is trusted by creators and professionals for its deep inventory, expert staff, and detailed product information. B&H offers the Payboo card for instant sales-tax reimbursement, fast shipping, and used/refurbished gear. Note that B&H observes Jewish holidays, during which orders are not processed.',
  },
  {
    name: 'Chewy',
    url: 'https://www.chewy.com',
    category: 'Pets',
    tagline: 'Pet food, supplies, and telehealth with fast shipping.',
    founded: 2011,
    hq: 'Plantation, Florida',
    phone: '1-800-672-4399',
    hours: '24 hours a day, 7 days a week',
    sells: ['Pet Food', 'Treats', 'Toys', 'Medications', 'Aquarium', 'Pet Health'],
    description:
      'Chewy is the leading online retailer for pet food, supplies, and health products, serving dog, cat, fish, bird, and small-pet owners. It is known for standout 24/7 customer service, Autoship subscriptions with discounts, and Connect With a Vet telehealth. Chewy Pharmacy fills prescription pet medications, and the company frequently surprises loyal customers with handwritten cards and pet portraits.',
  },
  {
    name: 'Macy’s',
    url: 'https://www.macys.com',
    category: 'Fashion & Apparel',
    tagline: 'Department-store fashion, home, and beauty.',
    founded: 1858,
    hq: 'New York, New York',
    phone: '1-800-289-6229',
    hours: 'Mon–Sun, 9am–midnight ET',
    sells: ['Clothing', 'Shoes', 'Beauty', 'Home', 'Jewelry', 'Handbags'],
    description:
      "Macy's is an iconic American department store selling apparel, shoes, beauty, home goods, jewelry, and accessories from hundreds of brands. Macys.com offers frequent sales, Star Rewards loyalty benefits, and Buy Online Pick Up In Store. Macy's is also famous for its Thanksgiving Day Parade and seasonal events, and remains a top destination for gifting, bridal registry, and cosmetics.",
  },
  {
    name: 'Kohl’s',
    url: 'https://www.kohls.com',
    category: 'Fashion & Apparel',
    tagline: 'Apparel, home, and Kohl’s Cash rewards.',
    founded: 1962,
    hq: 'Menomonee Falls, Wisconsin',
    phone: '1-855-564-5705',
    hours: 'Mon–Sun, 7am–1am CT',
    sells: ['Clothing', 'Shoes', 'Home', 'Beauty', 'Toys', 'Kitchen'],
    description:
      "Kohl's is a mid-market US department store offering apparel, footwear, home goods, and beauty (including in-store Sephora shops). It is well known for Kohl's Cash promotions, Yes2You/Kohl's Rewards, and generous coupon stacking. Kohl's also accepts Amazon returns for free at its stores, driving foot traffic and online engagement.",
  },
  {
    name: 'Nordstrom',
    url: 'https://www.nordstrom.com',
    category: 'Fashion & Apparel',
    tagline: 'Premium fashion with renowned customer service.',
    founded: 1901,
    hq: 'Seattle, Washington',
    phone: '1-888-282-6060',
    hours: '24 hours a day, 7 days a week',
    sells: ['Designer', 'Shoes', 'Clothing', 'Beauty', 'Handbags', 'Home'],
    description:
      'Nordstrom is an upscale US fashion retailer famous for its customer service, free shipping and returns, and curated selection of designer and contemporary brands. Nordstrom.com and Nordstrom Rack (its off-price arm) cover a wide range of budgets. The Nordy Club loyalty program rewards spending with points, early access to the Anniversary Sale, and personal styling.',
  },
  {
    name: 'Etsy',
    url: 'https://www.etsy.com',
    category: 'Marketplace',
    tagline: 'Handmade, vintage, and custom goods from small sellers.',
    founded: 2005,
    hq: 'Brooklyn, New York',
    phone: null,
    hours: 'Support via Help Center / email',
    sells: ['Handmade', 'Jewelry', 'Art', 'Craft Supplies', 'Vintage', 'Custom Gifts'],
    description:
      'Etsy is a global marketplace for handmade, vintage, and craft items sold by independent creators and small businesses. It is a top destination for personalized gifts, wedding decor, jewelry, digital downloads, and unique home pieces. Etsy does not operate a public phone line — buyers contact sellers directly or reach Etsy through its Help Center. Purchase Protection covers eligible orders that arrive damaged or not as described.',
  },
  {
    name: 'Sephora',
    url: 'https://www.sephora.com',
    category: 'Beauty & Health',
    tagline: 'Prestige makeup, skincare, and fragrance.',
    founded: 1969,
    hq: 'San Francisco, California',
    phone: '1-877-737-4672',
    hours: 'Mon–Sun, 6am–3am ET',
    sells: ['Makeup', 'Skincare', 'Fragrance', 'Hair', 'Tools', 'Wellness'],
    description:
      'Sephora is a leading beauty retailer offering prestige makeup, skincare, fragrance, and hair care from hundreds of brands, plus its own Sephora Collection. The Beauty Insider program gives points, birthday gifts, and tiered perks. Sephora is known for free samples, virtual try-on tools, in-store services, and an inclusive shade range across foundation and complexion products.',
  },
  {
    name: 'Ulta Beauty',
    url: 'https://www.ulta.com',
    category: 'Beauty & Health',
    tagline: 'Mass and prestige beauty under one roof.',
    founded: 1990,
    hq: 'Bolingbrook, Illinois',
    phone: '1-866-983-8582',
    hours: 'Mon–Sun, 7am–11pm CT',
    sells: ['Makeup', 'Skincare', 'Hair', 'Fragrance', 'Salon', 'Tools'],
    description:
      'Ulta Beauty is the largest US beauty retailer combining drugstore and prestige brands in one place, along with in-store salon and brow services. The Ultamate Rewards program earns points on every purchase, with frequent bonus events and coupons. Ulta is a favorite for its 21 Days of Beauty sale, broad brand range, and diamond-tier perks.',
  },
  {
    name: 'Nike',
    url: 'https://www.nike.com',
    category: 'Sports & Outdoors',
    tagline: 'Athletic footwear, apparel, and gear.',
    founded: 1964,
    hq: 'Beaverton, Oregon',
    phone: '1-800-806-6453',
    hours: 'Mon–Sun, 4am–11pm PT',
    sells: ['Sneakers', 'Apparel', 'Running', 'Basketball', 'Training', 'Accessories'],
    description:
      "Nike is the world's largest athletic brand, selling footwear, apparel, and equipment directly at Nike.com and through the Nike and SNKRS apps. Nike Members get free shipping, exclusive product launches, and early access to limited sneaker drops. The brand spans running, basketball, training, football, and lifestyle, with customization available through Nike By You.",
  },
  {
    name: 'Zappos',
    url: 'https://www.zappos.com',
    category: 'Fashion & Apparel',
    tagline: 'Shoes and clothing with legendary service.',
    founded: 1999,
    hq: 'Las Vegas, Nevada',
    phone: '1-800-927-7671',
    hours: '24 hours a day, 7 days a week',
    sells: ['Shoes', 'Clothing', 'Bags', 'Accessories', 'Athletic'],
    description:
      'Zappos is an online shoe and clothing retailer (owned by Amazon) renowned for exceptional 24/7 customer service and its 365-day return policy. It carries a huge selection of footwear across widths and sizes, plus apparel and accessories. Free shipping both ways makes it easy to try multiple sizes, and the VIP program adds faster shipping and early sale access.',
  },
  {
    name: 'Sam’s Club',
    url: 'https://www.samsclub.com',
    category: 'Warehouse Club',
    tagline: 'Warehouse-club bulk savings from Walmart.',
    founded: 1983,
    hq: 'Bentonville, Arkansas',
    phone: '1-888-746-7726',
    hours: 'Mon–Sun, 7am–11pm CT',
    sells: ['Groceries', 'Electronics', 'Furniture', 'Tires', 'Pharmacy', 'Bulk'],
    description:
      "Sam's Club is a membership warehouse club owned by Walmart, offering bulk groceries, electronics, furniture, tires, and more at member prices. SamsClub.com supports free shipping for Plus members, curbside pickup, and same-day delivery. The Scan & Go app lets members skip checkout lines, and Plus membership adds early hours and 2% Sam's Cash rewards.",
  },
  {
    name: 'Staples',
    url: 'https://www.staples.com',
    category: 'Office & Craft',
    tagline: 'Office supplies, tech, furniture, and print services.',
    founded: 1986,
    hq: 'Framingham, Massachusetts',
    phone: '1-800-333-3330',
    hours: 'Mon–Fri, 8am–8pm ET',
    sells: ['Office Supplies', 'Ink & Toner', 'Technology', 'Furniture', 'Printing'],
    description:
      'Staples is a major US office-supply retailer selling paper, ink and toner, technology, furniture, and cleaning and breakroom products. Staples.com offers fast delivery, in-store and curbside pickup, and print & marketing services for business cards, flyers, and shipping. Staples Rewards and business accounts provide bulk pricing and recycling perks for offices of all sizes.',
  },
  {
    name: 'Office Depot',
    url: 'https://www.officedepot.com',
    category: 'Office & Craft',
    tagline: 'Office products, furniture, and print & tech services.',
    founded: 1986,
    hq: 'Boca Raton, Florida',
    phone: '1-800-463-3768',
    hours: 'Mon–Fri, 8am–9pm ET',
    sells: ['Office Supplies', 'Furniture', 'Technology', 'Ink', 'Printing'],
    description:
      'Office Depot and OfficeMax sell office supplies, furniture, technology, and print services to consumers and businesses. Online shoppers get free next-business-day delivery on qualifying orders, plus curbside and in-store pickup. The Office Depot fitting rooms for chairs, tech support, and copy & print center round out a full small-business offering, with rewards for frequent buyers.',
  },
  {
    name: 'GameStop',
    url: 'https://www.gamestop.com',
    category: 'Electronics',
    tagline: 'Video games, consoles, and collectibles.',
    founded: 1984,
    hq: 'Grapevine, Texas',
    phone: '1-800-883-8895',
    hours: 'Mon–Fri, 8am–9pm CT',
    sells: ['Consoles', 'Games', 'Collectibles', 'Accessories', 'Trade-Ins'],
    description:
      'GameStop is a specialty retailer for video games, consoles, gaming accessories, and pop-culture collectibles. It is known for its trade-in program, letting customers exchange used games and hardware for credit. GameStop PowerUp Rewards Pro members earn points and monthly perks. The site carries new and pre-owned titles across PlayStation, Xbox, Nintendo, and PC.',
  },
  {
    name: "Dick's Sporting Goods",
    url: 'https://www.dickssportinggoods.com',
    category: 'Sports & Outdoors',
    tagline: 'Sporting goods, apparel, and outdoor gear.',
    founded: 1948,
    hq: 'Coraopolis, Pennsylvania',
    phone: '1-877-846-9997',
    hours: 'Mon–Sun, 9am–9pm ET',
    sells: ['Fitness', 'Team Sports', 'Golf', 'Outdoor', 'Footwear', 'Apparel'],
    description:
      "Dick's Sporting Goods is a leading US sporting-goods retailer offering fitness equipment, team-sports gear, golf, footwear, and outdoor products. Its ScoreCard loyalty program earns points toward rewards. Dick's operates specialty concepts like Golf Galaxy and Public Lands, and provides services such as bike and golf-club fitting, plus in-store and curbside pickup.",
  },
  {
    name: 'Petco',
    url: 'https://www.petco.com',
    category: 'Pets',
    tagline: 'Pet food, supplies, grooming, and vet services.',
    founded: 1965,
    hq: 'San Diego, California',
    phone: '1-877-738-6742',
    hours: 'Mon–Sun, 6am–9pm PT',
    sells: ['Pet Food', 'Supplies', 'Grooming', 'Vet Care', 'Aquatics', 'Live Pets'],
    description:
      'Petco is a national pet-care retailer offering food, supplies, grooming, training, and veterinary services through in-store Vetco clinics and hospitals. Petco.com supports repeat-delivery discounts and same-day delivery. The Vital Care membership bundles vet visits, grooming perks, and rewards, making Petco a one-stop shop for dogs, cats, fish, reptiles, and small animals.',
  },
  {
    name: 'Apple',
    url: 'https://www.apple.com',
    category: 'Electronics',
    tagline: 'iPhone, Mac, iPad, and accessories direct from Apple.',
    founded: 1976,
    hq: 'Cupertino, California',
    phone: '1-800-692-7753',
    hours: 'Mon–Sun, 8am–8pm local',
    sells: ['iPhone', 'Mac', 'iPad', 'Apple Watch', 'AirPods', 'Accessories'],
    description:
      'Apple sells its iPhone, Mac, iPad, Apple Watch, AirPods, and accessories directly through Apple.com and the Apple Store app. Customers can configure Macs, trade in old devices for credit, and get free engraving and personalized setup. AppleCare provides extended support and coverage, while the Genius Bar handles in-store repairs and technical help.',
  },
  {
    name: 'Dell',
    url: 'https://www.dell.com',
    category: 'Electronics',
    tagline: 'Laptops, desktops, monitors, and business IT.',
    founded: 1984,
    hq: 'Round Rock, Texas',
    phone: '1-800-624-9897',
    hours: 'Mon–Fri, 8am–8pm CT',
    sells: ['Laptops', 'Desktops', 'Monitors', 'Servers', 'Accessories'],
    description:
      'Dell is a major US computer manufacturer selling laptops, desktops, monitors, and enterprise IT directly to consumers and businesses. Shoppers can customize XPS, Inspiron, and Alienware systems to order, with financing and trade-in options. Dell provides Premium Support, business volume pricing through Dell for Business, and frequent online-only configuration deals.',
  },
  {
    name: 'IKEA',
    url: 'https://www.ikea.com/us/en/',
    category: 'Home & Furniture',
    tagline: 'Affordable ready-to-assemble furniture and home goods.',
    founded: 1943,
    hq: 'Conshohocken, Pennsylvania (US)',
    phone: '1-888-888-4532',
    hours: 'Mon–Sun, 8am–8pm local',
    sells: ['Furniture', 'Storage', 'Kitchen', 'Textiles', 'Lighting', 'Decor'],
    description:
      'IKEA is the well-known Swedish home-furnishings brand offering affordable, flat-pack furniture, storage, kitchens, and decor. In the US, IKEA.com supports delivery and click-and-collect, plus planning tools for kitchens and wardrobes. IKEA Family membership adds member prices and perks, and the brand is famous for its showroom layouts, meatballs, and design-forward value.',
  },
  {
    name: 'Williams-Sonoma',
    url: 'https://www.williams-sonoma.com',
    category: 'Home & Furniture',
    tagline: 'Premium cookware, kitchen, and home.',
    founded: 1956,
    hq: 'San Francisco, California',
    phone: '1-877-812-6235',
    hours: 'Mon–Sun, 7am–midnight ET',
    sells: ['Cookware', 'Appliances', 'Kitchen Tools', 'Food', 'Home', 'Registry'],
    description:
      'Williams-Sonoma is an upscale retailer of cookware, kitchen electrics, tools, and gourmet food, part of a family of brands that includes Pottery Barn and West Elm. It is a popular wedding-registry destination and a source for premium brands and exclusive collaborations. Stores offer cooking classes and expert advice, while the site features recipes and technique guides.',
  },
  {
    name: 'Crate & Barrel',
    url: 'https://www.crateandbarrel.com',
    category: 'Home & Furniture',
    tagline: 'Modern furniture, dinnerware, and decor.',
    founded: 1962,
    hq: 'Northbrook, Illinois',
    phone: '1-800-967-6696',
    hours: 'Mon–Sun, 9am–8pm CT',
    sells: ['Furniture', 'Dinnerware', 'Decor', 'Kitchen', 'Outdoor', 'Registry'],
    description:
      'Crate & Barrel is a modern home retailer known for clean-lined furniture, dinnerware, and housewares, along with its contemporary CB2 brand. It is a favorite for wedding and gift registries. Crate & Barrel offers design services, financing, and both delivery and in-store pickup, with a curated aesthetic spanning living, dining, bed, and outdoor.',
  },
  {
    name: 'Michaels',
    url: 'https://www.michaels.com',
    category: 'Office & Craft',
    tagline: 'Arts, crafts, framing, and seasonal decor.',
    founded: 1973,
    hq: 'Irving, Texas',
    phone: '1-800-642-4235',
    hours: 'Mon–Sun, 8am–9pm CT',
    sells: ['Craft Supplies', 'Yarn', 'Framing', 'Seasonal', 'Art', 'Party'],
    description:
      'Michaels is the largest US arts-and-crafts retailer, selling supplies for painting, knitting, scrapbooking, floral, framing, and seasonal projects. Michaels.com supports same-day delivery and buy-online-pickup-in-store, with custom framing services. The Michaels Rewards program offers member pricing and coupons, and the site features free project ideas and classes for crafters of all levels.',
  },
  {
    name: 'AutoZone',
    url: 'https://www.autozone.com',
    category: 'Auto',
    tagline: 'Auto parts, batteries, and accessories.',
    founded: 1979,
    hq: 'Memphis, Tennessee',
    phone: '1-800-288-6966',
    hours: 'Mon–Sun, 7:30am–10pm CT',
    sells: ['Auto Parts', 'Batteries', 'Oil', 'Accessories', 'Tools'],
    description:
      'AutoZone is the largest US retailer of aftermarket automotive parts and accessories, serving DIY customers and professional mechanics. It offers free services like battery testing and installation, alternator/starter testing, and loaner tools. AutoZone.com lets shoppers look up parts by vehicle, check store availability, and choose delivery or next-day store pickup.',
  },
  {
    name: 'Walgreens',
    url: 'https://www.walgreens.com',
    category: 'Beauty & Health',
    tagline: 'Pharmacy, health, beauty, and photo.',
    founded: 1901,
    hq: 'Deerfield, Illinois',
    phone: '1-800-925-4733',
    hours: 'Mon–Sun, 7am–9pm CT',
    sells: ['Pharmacy', 'Health', 'Beauty', 'Photo', 'Household', 'Vitamins'],
    description:
      'Walgreens is a leading US pharmacy and health-and-wellness retailer offering prescription refills, vaccinations, over-the-counter medicine, beauty, and photo printing. Walgreens.com and the app support prescription management, same-day pickup and delivery, and myWalgreens rewards. The chain is a convenient destination for everyday health, personal care, and last-minute essentials.',
  },
  {
    name: 'CVS Pharmacy',
    url: 'https://www.cvs.com',
    category: 'Beauty & Health',
    tagline: 'Pharmacy, health, and everyday essentials.',
    founded: 1963,
    hq: 'Woonsocket, Rhode Island',
    phone: '1-800-746-7287',
    hours: 'Mon–Sun, 8am–10pm ET',
    sells: ['Pharmacy', 'Health', 'Beauty', 'Vitamins', 'Household', 'MinuteClinic'],
    description:
      'CVS Pharmacy is one of the largest US pharmacy chains, offering prescriptions, vaccines, health and wellness products, beauty, and everyday essentials. CVS.com and the app handle prescription refills, ExtraCare rewards, and same-day delivery. Many locations include a MinuteClinic for walk-in care, making CVS a broad healthcare and convenience retailer.',
  },
];

// Deduped, slugged, sorted for stable output.
export const retailers = RAW.map((r) => ({ ...r, slug: slugify(r.name) })).sort((a, b) =>
  a.name.localeCompare(b.name),
);

export function retailerBySlug(slug) {
  return retailers.find((r) => r.slug === slug) || null;
}

/** Distinct categories with their retailers, for the directory + category pages. */
export function retailerCategories() {
  const map = new Map();
  for (const r of retailers) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category).push(r);
  }
  return [...map.entries()]
    .map(([name, list]) => ({ name, slug: slugify(name), retailers: list }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function categoryBySlug(slug) {
  return retailerCategories().find((c) => c.slug === slug) || null;
}

export function relatedRetailers(r, n = 6) {
  const same = retailers.filter((x) => x.category === r.category && x.slug !== r.slug);
  if (same.length >= n) return same.slice(0, n);
  const extra = retailers.filter((x) => x.slug !== r.slug && x.category !== r.category);
  return same.concat(extra).slice(0, n);
}
