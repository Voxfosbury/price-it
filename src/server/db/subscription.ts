import { db } from "@/drizzle/db"
import { UserSubscriptionTable } from "@/drizzle/schema"
import { CACHE_TAGS, dbCache, getUserTag, revalidateDbCache } from "@/lib/cache"
import { SQL } from "drizzle-orm"

// ✅ Static subscription tiers
const subscriptionTiers = [
  {
    name: "Free",
    price: 0,
    maxNumberOfVisits: 100,
    maxNumberOfProducts: 3,
    canRemoveBranding: false,
    canAccessAnalytics: false,
    canCustomizeBanner: false,
  },
  {
    name: "Pro",
    price: 1000,
    maxNumberOfVisits: 1000,
    maxNumberOfProducts: 100,
    canRemoveBranding: true,
    canAccessAnalytics: true,
    canCustomizeBanner: true,
  },
  {
    name: "Business",
    price: 2500,
    maxNumberOfVisits: 10000,
    maxNumberOfProducts: 1000,
    canRemoveBranding: true,
    canAccessAnalytics: true,
    canCustomizeBanner: true,
  },
]

// ✅ Export all tiers for display or comparison
export function getAvailableSubscriptionTiers() {
  return subscriptionTiers
}

// ✅ Create subscription with tier validation
export async function createUserSubscription(
  data: typeof UserSubscriptionTable.$inferInsert
) {
  const isValidTier = subscriptionTiers.some(
    (tier) => tier.name === data.tier
  )

  if (!isValidTier) {
    throw new Error("Invalid subscription tier selected.")
  }

  const [newSubscription] = await db
    .insert(UserSubscriptionTable)
    .values(data)
    .onConflictDoNothing({
      target: UserSubscriptionTable.clerkUserId,
    })
    .returning({
      id: UserSubscriptionTable.id,
      userId: UserSubscriptionTable.clerkUserId,
    })

  if (newSubscription) {
    revalidateDbCache({
      tag: CACHE_TAGS.subscription,
      id: newSubscription.id,
      userId: newSubscription.userId,
    })
  }

  return newSubscription
}

// ✅ Cached subscription getter
export function getUserSubscription(userId: string) {
  const cacheFn = dbCache(getUserSubscriptionInternal, {
    tags: [getUserTag(userId, CACHE_TAGS.subscription)],
  })

  return cacheFn(userId)
}

// ✅ Update subscription with tier validation
export async function updateUserSubscription(
  where: SQL,
  data: Partial<typeof UserSubscriptionTable.$inferInsert>
) {
  if (data.tier) {
    const isValidTier = subscriptionTiers.some(
      (tier) => tier.name === data.tier
    )
    if (!isValidTier) {
      throw new Error("Invalid subscription tier selected.")
    }
  }

  const [updatedSubscription] = await db
    .update(UserSubscriptionTable)
    .set(data)
    .where(where)
    .returning({
      id: UserSubscriptionTable.id,
      userId: UserSubscriptionTable.clerkUserId,
    })

  if (updatedSubscription) {
    revalidateDbCache({
      tag: CACHE_TAGS.subscription,
      userId: updatedSubscription.userId,
      id: updatedSubscription.id,
    })
  }
}

// ✅ Return tier details for a given user
export async function getUserSubscriptionTier(userId: string) {
  const subscription = await getUserSubscription(userId)

  // 🟢 Default to "Pro" if not set
  const tierName = subscription?.tier || "Pro"

  const tierDetails = subscriptionTiers.find((t) => t.name === tierName)

  if (!tierDetails) {
    throw new Error("Invalid subscription tier in DB")
  }

  return tierDetails
}

// ✅ Internal DB fetcher
function getUserSubscriptionInternal(userId: string) {
  return db.query.UserSubscriptionTable.findFirst({
    where: ({ clerkUserId }, { eq }) => eq(clerkUserId, userId),
  })
}
