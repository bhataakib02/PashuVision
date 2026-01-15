const fs = require('fs');
const path = require('path');

class MarketplaceService {
  constructor() {
    this.listings = [];
    this.categories = this.initializeCategories();
    this.services = this.initializeServices();
    this.loadListings();
  }

  initializeCategories() {
    return {
      'feed_suppliers': {
        name: 'Feed Suppliers',
        description: 'Quality animal feed and supplements',
        icon: '🌾',
        subcategories: ['Cattle Feed', 'Buffalo Feed', 'Mineral Supplements', 'Hay & Fodder']
      },
      'veterinary_services': {
        name: 'Veterinary Services',
        description: 'Professional veterinary care and consultation',
        icon: '🏥',
        subcategories: ['Health Checkup', 'Vaccination', 'Treatment', 'Emergency Care']
      },
      'milk_collection': {
        name: 'Milk Collection',
        description: 'Milk collection and processing services',
        icon: '🥛',
        subcategories: ['Daily Collection', 'Bulk Collection', 'Processing', 'Storage']
      },
      'breeding_services': {
        name: 'Breeding Services',
        description: 'Artificial insemination and breeding programs',
        icon: '🧬',
        subcategories: ['AI Services', 'Breeding Bulls', 'Semen Banks', 'Genetic Testing']
      },
      'equipment_rental': {
        name: 'Equipment Rental',
        description: 'Farm equipment and machinery rental',
        icon: '🚜',
        subcategories: ['Milking Machines', 'Feed Mixers', 'Transport Vehicles', 'Medical Equipment']
      },
      'insurance_services': {
        name: 'Insurance Services',
        description: 'Livestock insurance and risk management',
        icon: '🛡️',
        subcategories: ['Livestock Insurance', 'Health Insurance', 'Accident Coverage', 'Natural Disaster']
      }
    };
  }

  initializeServices() {
    return [
      {
        id: 'feed_001',
        category: 'feed_suppliers',
        subcategory: 'Cattle Feed',
        name: 'Premium Cattle Feed',
        provider: 'Green Fields Feed Co.',
        description: 'High-quality cattle feed with balanced nutrition',
        price: 25.50,
        unit: 'per kg',
        location: 'Punjab',
        rating: 4.5,
        reviews: 128,
        features: ['High protein content', 'Mineral enriched', 'Digestible', 'Cost effective'],
        contact: {
          phone: '+91-9876543210',
          email: 'sales@greenfields.com',
          address: '123 Farm Road, Ludhiana, Punjab'
        },
        availability: 'In Stock',
        delivery: 'Free delivery within 50km',
        image: '/images/feed_cattle.jpg'
      },
      {
        id: 'vet_001',
        category: 'veterinary_services',
        subcategory: 'Health Checkup',
        name: 'Complete Health Checkup',
        provider: 'Dr. Rajesh Veterinary Clinic',
        description: 'Comprehensive health examination for cattle and buffaloes',
        price: 500,
        unit: 'per visit',
        location: 'Haryana',
        rating: 4.8,
        reviews: 89,
        features: ['Full body examination', 'Blood tests', 'Health certificate', 'Follow-up care'],
        contact: {
          phone: '+91-9876543211',
          email: 'drrajesh@vetclinic.com',
          address: '456 Medical Street, Karnal, Haryana'
        },
        availability: 'Available',
        delivery: 'Home visit available',
        image: '/images/vet_checkup.jpg'
      },
      {
        id: 'milk_001',
        category: 'milk_collection',
        subcategory: 'Daily Collection',
        name: 'Daily Milk Collection Service',
        provider: 'Fresh Milk Co-operative',
        description: 'Daily milk collection from your farm',
        price: 45,
        unit: 'per liter',
        location: 'Gujarat',
        rating: 4.3,
        reviews: 156,
        features: ['Daily collection', 'Fair pricing', 'Quality testing', 'Timely payment'],
        contact: {
          phone: '+91-9876543212',
          email: 'collection@freshmilk.coop',
          address: '789 Co-op Road, Anand, Gujarat'
        },
        availability: 'Available',
        delivery: 'Daily pickup service',
        image: '/images/milk_collection.jpg'
      },
      {
        id: 'breeding_001',
        category: 'breeding_services',
        subcategory: 'AI Services',
        name: 'Artificial Insemination Service',
        provider: 'Advanced Breeding Center',
        description: 'Professional AI services with high-quality semen',
        price: 800,
        unit: 'per service',
        location: 'Maharashtra',
        rating: 4.7,
        reviews: 203,
        features: ['High-quality semen', 'Expert technicians', 'Success guarantee', 'Follow-up support'],
        contact: {
          phone: '+91-9876543213',
          email: 'ai@breedingcenter.com',
          address: '321 Breeding Lane, Pune, Maharashtra'
        },
        availability: 'Available',
        delivery: 'Service at your location',
        image: '/images/ai_service.jpg'
      }
    ];
  }

  loadListings() {
    try {
      // Use /tmp for Vercel serverless, regular data dir for local/dev
      const dataDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..', '..', 'data');
      const listingsFile = path.join(dataDir, 'marketplace.json');
      
      // Ensure directory exists
      if (!fs.existsSync(dataDir)) {
        try {
          fs.mkdirSync(dataDir, { recursive: true });
        } catch (mkdirError) {
          console.warn('Could not create data directory, using in-memory storage:', mkdirError.message);
          this.listings = this.services;
          return;
        }
      }
      
      if (fs.existsSync(listingsFile)) {
        this.listings = JSON.parse(fs.readFileSync(listingsFile, 'utf8'));
      } else {
        this.listings = this.services;
        this.saveListings();
      }
    } catch (error) {
      console.error('Error loading marketplace listings:', error);
      this.listings = this.services;
    }
  }

  saveListings() {
    try {
      // Use /tmp for Vercel serverless, regular data dir for local/dev
      const dataDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '..', '..', 'data');
      const listingsFile = path.join(dataDir, 'marketplace.json');
      
      // Ensure directory exists
      if (!fs.existsSync(dataDir)) {
        try {
          fs.mkdirSync(dataDir, { recursive: true });
        } catch (mkdirError) {
          console.warn('Could not create data directory, skipping save:', mkdirError.message);
          return;
        }
      }
      
      fs.writeFileSync(listingsFile, JSON.stringify(this.listings, null, 2));
    } catch (error) {
      console.error('Error saving marketplace listings:', error);
      // Don't throw - allow service to continue without file persistence
    }
  }

  getListings(filters = {}) {
    let filteredListings = [...this.listings];

    // Apply filters
    if (filters.category) {
      filteredListings = filteredListings.filter(listing => listing.category === filters.category);
    }

    if (filters.subcategory) {
      filteredListings = filteredListings.filter(listing => listing.subcategory === filters.subcategory);
    }

    if (filters.location) {
      filteredListings = filteredListings.filter(listing => 
        listing.location.toLowerCase().includes(filters.location.toLowerCase())
      );
    }

    if (filters.minPrice !== undefined) {
      filteredListings = filteredListings.filter(listing => listing.price >= filters.minPrice);
    }

    if (filters.maxPrice !== undefined) {
      filteredListings = filteredListings.filter(listing => listing.price <= filters.maxPrice);
    }

    if (filters.minRating !== undefined) {
      filteredListings = filteredListings.filter(listing => listing.rating >= filters.minRating);
    }

    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filteredListings = filteredListings.filter(listing =>
        listing.name.toLowerCase().includes(searchTerm) ||
        listing.description.toLowerCase().includes(searchTerm) ||
        listing.provider.toLowerCase().includes(searchTerm)
      );
    }

    // Sort results
    const sortBy = filters.sortBy || 'rating';
    const sortOrder = filters.sortOrder || 'desc';

    filteredListings.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      if (sortBy === 'price') {
        aValue = parseFloat(aValue);
        bValue = parseFloat(bValue);
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filteredListings;
  }

  getListingById(id) {
    return this.listings.find(listing => listing.id === id);
  }

  getCategories() {
    return this.categories;
  }

  getRecommendations(animalData, userLocation) {
    const recommendations = [];

    // Feed recommendations based on breed and age
    if (animalData.predictedBreed && animalData.ageMonths) {
      const feedRecommendations = this.getFeedRecommendations(animalData);
      recommendations.push(...feedRecommendations);
    }

    // Veterinary services based on location
    const vetServices = this.listings.filter(listing => 
      listing.category === 'veterinary_services' &&
      listing.location.toLowerCase().includes(userLocation.toLowerCase())
    );
    recommendations.push(...vetServices.slice(0, 2));

    // Milk collection services
    const milkServices = this.listings.filter(listing => 
      listing.category === 'milk_collection' &&
      listing.location.toLowerCase().includes(userLocation.toLowerCase())
    );
    recommendations.push(...milkServices.slice(0, 2));

    // Breeding services for female animals
    if (animalData.gender === 'female' && animalData.ageMonths > 24) {
      const breedingServices = this.listings.filter(listing => 
        listing.category === 'breeding_services'
      );
      recommendations.push(...breedingServices.slice(0, 1));
    }

    return recommendations.slice(0, 5); // Return top 5 recommendations
  }

  getFeedRecommendations(animalData) {
    const breed = animalData.predictedBreed.toLowerCase();
    const age = animalData.ageMonths;

    let feedType = 'Cattle Feed';
    if (breed.includes('murrah') || breed.includes('buffalo')) {
      feedType = 'Buffalo Feed';
    }

    const recommendations = this.listings.filter(listing => 
      listing.category === 'feed_suppliers' &&
      listing.subcategory === feedType
    );

    // Add age-specific recommendations
    return recommendations.map(listing => ({
      ...listing,
      recommendationReason: this.getFeedRecommendationReason(age, breed),
      priority: this.calculateFeedPriority(age, breed)
    }));
  }

  getFeedRecommendationReason(age, breed) {
    if (age < 12) {
      return 'Young animal needs high-protein feed for growth';
    } else if (age > 60) {
      return 'Mature animal needs maintenance feed';
    } else {
      return 'Adult animal needs balanced nutrition for production';
    }
  }

  calculateFeedPriority(age, breed) {
    if (age < 12 || age > 60) return 'high';
    return 'medium';
  }

  createListing(listingData, userId) {
    const newListing = {
      id: `listing_${Date.now()}`,
      ...listingData,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      status: 'active',
      views: 0,
      inquiries: 0
    };

    this.listings.push(newListing);
    this.saveListings();
    return newListing;
  }

  updateListing(id, updates, userId) {
    const listingIndex = this.listings.findIndex(listing => listing.id === id);
    if (listingIndex === -1) {
      throw new Error('Listing not found');
    }

    if (this.listings[listingIndex].createdBy !== userId) {
      throw new Error('Unauthorized to update this listing');
    }

    this.listings[listingIndex] = {
      ...this.listings[listingIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.saveListings();
    return this.listings[listingIndex];
  }

  deleteListing(id, userId) {
    const listingIndex = this.listings.findIndex(listing => listing.id === id);
    if (listingIndex === -1) {
      throw new Error('Listing not found');
    }

    if (this.listings[listingIndex].createdBy !== userId) {
      throw new Error('Unauthorized to delete this listing');
    }

    this.listings.splice(listingIndex, 1);
    this.saveListings();
    return true;
  }

  recordInquiry(listingId, userId, message) {
    const listing = this.getListingById(listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }

    const inquiry = {
      id: `inquiry_${Date.now()}`,
      listingId,
      userId,
      message,
      timestamp: new Date().toISOString(),
      status: 'pending'
    };

    // In a real implementation, this would be stored in a database
    console.log('New inquiry:', inquiry);
    
    // Update listing inquiry count
    listing.inquiries = (listing.inquiries || 0) + 1;
    this.saveListings();

    return inquiry;
  }

  getMarketplaceStats() {
    const stats = {
      totalListings: this.listings.length,
      categories: {},
      averageRating: 0,
      totalReviews: 0
    };

    // Calculate category-wise stats
    Object.keys(this.categories).forEach(category => {
      const categoryListings = this.listings.filter(listing => listing.category === category);
      stats.categories[category] = {
        count: categoryListings.length,
        name: this.categories[category].name
      };
    });

    // Calculate average rating
    const listingsWithRatings = this.listings.filter(listing => listing.rating);
    if (listingsWithRatings.length > 0) {
      stats.averageRating = listingsWithRatings.reduce((sum, listing) => sum + listing.rating, 0) / listingsWithRatings.length;
      stats.totalReviews = listingsWithRatings.reduce((sum, listing) => sum + (listing.reviews || 0), 0);
    }

    return stats;
  }

  searchListings(query, filters = {}) {
    const searchFilters = {
      ...filters,
      search: query
    };
    return this.getListings(searchFilters);
  }
}

module.exports = MarketplaceService;
