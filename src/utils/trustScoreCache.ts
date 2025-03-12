/**
 * Utility for caching trust scores in localStorage
 */

// Cache key for trust scores
const TRUST_SCORES_CACHE_KEY = 'graphhopper_trust_scores';

// Cache expiration in milliseconds (7 days)
const CACHE_EXPIRATION = 1000 * 60 * 60 * 24 * 7;

interface CachedTrustScores {
  scores: Record<string, number>;
  timestamp: number;
}

/**
 * Save trust scores to localStorage
 */
export const cacheTrustScores = (scores: Map<string, number>): void => {
  try {
    // Convert Map to a plain object for storage
    const scoresObject: Record<string, number> = {};
    scores.forEach((score, pubkey) => {
      scoresObject[pubkey] = score;
    });
    
    const cacheData: CachedTrustScores = {
      scores: scoresObject,
      timestamp: Date.now()
    };
    
    localStorage.setItem(TRUST_SCORES_CACHE_KEY, JSON.stringify(cacheData));
    console.log(`Cached ${Object.keys(scoresObject).length} trust scores to localStorage`);
  } catch (error) {
    console.error('Error saving trust scores to localStorage:', error);
  }
};

/**
 * Retrieve cached trust scores from localStorage
 * Returns a Map of pubkey to trust score
 */
export const getCachedTrustScores = (): Map<string, number> => {
  try {
    const cachedData = localStorage.getItem(TRUST_SCORES_CACHE_KEY);
    if (!cachedData) {
      return new Map<string, number>();
    }
    
    const parsedData: CachedTrustScores = JSON.parse(cachedData);
    
    // Check if cache is expired
    if (Date.now() - parsedData.timestamp > CACHE_EXPIRATION) {
      console.log('Trust score cache is expired, clearing');
      localStorage.removeItem(TRUST_SCORES_CACHE_KEY);
      return new Map<string, number>();
    }
    
    // Convert object back to Map
    const trustScores = new Map<string, number>();
    Object.entries(parsedData.scores).forEach(([pubkey, score]) => {
      trustScores.set(pubkey, score);
    });
    
    console.log(`Loaded ${trustScores.size} cached trust scores from localStorage`);
    return trustScores;
  } catch (error) {
    console.error('Error retrieving trust scores from localStorage:', error);
    return new Map<string, number>();
  }
};

/**
 * Clear cached trust scores
 */
export const clearCachedTrustScores = (): void => {
  try {
    localStorage.removeItem(TRUST_SCORES_CACHE_KEY);
    console.log('Trust score cache cleared');
  } catch (error) {
    console.error('Error clearing trust scores from localStorage:', error);
  }
};

/**
 * Convert trust score from 0-1 scale to 0-100 scale and round to integer
 */
export const formatTrustScore = (score: number | undefined): number => {
  if (score === undefined) return 0;
  return Math.round(score * 100);
}; 