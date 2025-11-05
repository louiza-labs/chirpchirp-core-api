import { createClient } from "@supabase/supabase-js";
import { Elysia } from "elysia";

// ============================================================================
// Supabase Setup
// ============================================================================

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// ============================================================================
// Types
// ============================================================================

interface Image {
  id: string;
  taken_on: string;
  stored_on: string;
  file_name: string;
  local_file_name: string;
  image_size: number;
  image_url: string;
  download_url: string;
  enhanced_image_url: string | null;
  camera_id: string;
  camera_name: string;
  modem_meid: string;
  latitude: number;
  longitude: number;
  is_video: boolean;
  video_url: string | null;
  user_id: string;
  is_favorite: boolean;
  temperature: number | null;
  moon_phase: string | null;
  tags: string[] | null;
}

interface Attribution {
  image_id: string;
  model_version: string;
  species: string;
  confidence: number;
  extra: any;
}

interface ImageWithAttributions extends Image {
  attributions: Attribution[];
}

// ============================================================================
// API Routes
// ============================================================================

const app = new Elysia()
  // Health check
  .get("/", () => ({ status: "ok", service: "core-api-service" }))

  // Get all images with their attributions (paginated)
  .get("/images", async ({ query }) => {
    console.log("the query", query);
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const timeRange = (query.timeRange as string) || "All";
    const speciesFilter = query.species as string | undefined;
    console.log("the speciesFilter", speciesFilter);
    try {
      // Calculate date threshold based on time range
      let dateThreshold: string | null = null;
      const now = new Date();

      switch (timeRange) {
        case "1D":
          dateThreshold = new Date(
            now.getTime() - 24 * 60 * 60 * 1000
          ).toISOString();
          break;
        case "7D":
          dateThreshold = new Date(
            now.getTime() - 7 * 24 * 60 * 60 * 1000
          ).toISOString();
          break;
        case "1M":
          dateThreshold = new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000
          ).toISOString();
          break;
        case "3M":
          dateThreshold = new Date(
            now.getTime() - 90 * 24 * 60 * 60 * 1000
          ).toISOString();
          break;
        case "1YR":
          dateThreshold = new Date(
            now.getTime() - 365 * 24 * 60 * 60 * 1000
          ).toISOString();
          break;
        case "All":
        default:
          dateThreshold = null;
          break;
      }

      // Build count query with date filter
      let countQuery = supabase
        .from("images")
        .select("*", { count: "exact", head: true });
      if (dateThreshold) {
        countQuery = countQuery.gte("taken_on", dateThreshold);
      }
      const { count } = await countQuery;

      // Build images query with date filter
      let imagesQuery = supabase
        .from("images")
        .select("*")
        .order("taken_on", { ascending: false });

      if (dateThreshold) {
        imagesQuery = imagesQuery.gte("taken_on", dateThreshold);
      }

      const { data: images, error: imagesError } = await imagesQuery.range(
        offset,
        offset + limit - 1
      );

      if (imagesError) throw imagesError;

      if (!images || images.length === 0) {
        return {
          images: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }

      // Get attributions for all images
      const imageIds = images.map((img) => img.id);
      const { data: attributions, error: attribError } = await supabase
        .from("attributions")
        .select("*")
        .in("image_id", imageIds);

      if (attribError) throw attribError;

      // Group attributions by image_id
      const attributionsByImage = (attributions || []).reduce(
        (acc: Record<string, Attribution[]>, attr: Attribution) => {
          if (!acc[attr.image_id]) acc[attr.image_id] = [];
          acc[attr.image_id].push(attr);
          return acc;
        },
        {}
      );

      // Combine images with their attributions
      const imagesWithAttributions: ImageWithAttributions[] = images
        .filter((unfilteredImage) => {
          const attrs = attributionsByImage[unfilteredImage.id];
          // Only include images that have attributions with valid species
          if (
            !attrs ||
            !attrs.some(
              (attr: Attribution) => attr.species && attr.species.trim() !== ""
            )
          ) {
            return false;
          }

          // If species filter is provided, check if any attribution matches
          if (speciesFilter) {
            return attrs.some(
              (attr: Attribution) => attr.species === speciesFilter
            );
          }

          return true;
        })
        .map((img) => ({
          ...img,
          attributions: attributionsByImage[img.id] || [],
        }));

      console.log("imagesWithAttributions", imagesWithAttributions);

      return {
        images: imagesWithAttributions,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
        filters: {
          timeRange,
          species: speciesFilter || null,
        },
      };
    } catch (error) {
      console.error("Error fetching images:", error);
      throw error;
    }
  })

  // Get a specific image with its attributions
  .get("/images/:id", async ({ params }) => {
    try {
      console.log("the params", params);
      // Get the image
      const { data: image, error: imageError } = await supabase
        .from("images")
        .select("*")
        .eq("id", params.id)
        .single();

      if (imageError) {
        if (imageError.code === "PGRST116") {
          return { error: "Image not found", status: 404 };
        }
        throw imageError;
      }

      // Get attributions for this image
      const { data: attributions, error: attribError } = await supabase
        .from("attributions")
        .select("*")
        .eq("image_id", params.id)
        .order("confidence", { ascending: false });

      if (attribError) throw attribError;

      return {
        ...image,
        attributions: attributions || [],
      };
    } catch (error) {
      console.error(`Error fetching image ${params.id}:`, error);
      throw error;
    }
  })

  // Get only attributions for a specific image
  .get("/images/:id/attributions", async ({ params }) => {
    try {
      const { data: attributions, error } = await supabase
        .from("attributions")
        .select("*")
        .eq("image_id", params.id)
        .order("confidence", { ascending: false });

      if (error) throw error;

      return {
        image_id: params.id,
        attributions: attributions || [],
      };
    } catch (error) {
      console.error(`Error fetching attributions for ${params.id}:`, error);
      throw error;
    }
  })
  // get all species
  .get("/species", async ({ query }) => {
    try {
      const { data: attributions, error } = await supabase
        .from("attributions")
        .select("species");

      if (error) throw error;

      // Count instances of each species
      const speciesCounts = (attributions || []).reduce(
        (acc: Record<string, number>, attr: { species: string }) => {
          if (attr.species && attr.species.trim() !== "") {
            acc[attr.species] = (acc[attr.species] || 0) + 1;
          }
          return acc;
        },
        {}
      );

      // Convert to array of objects with species and count
      const speciesArray = Object.entries(speciesCounts)
        .map(([species, count]) => ({ species, count }))
        .sort((a, b) => b.count - a.count); // Sort by count descending

      return {
        species: speciesArray,
      };
    } catch (error) {
      console.error("Error fetching species:", error);
      throw error;
    }
  })

  .listen({
    port: parseInt(process.env.PORT || "8080"),
    // hostname: "0.0.0.0",
  });

console.log(
  `🦊 ChirpChirp is running at ${app.server?.hostname}:${app.server?.port}`
);
