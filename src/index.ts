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
    const page = parseInt(query.page as string) || 1;
    const limit = parseInt(query.limit as string) || 20;
    const offset = (page - 1) * limit;

    try {
      // Get total count
      const { count } = await supabase
        .from("images")
        .select("*", { count: "exact", head: true });

      // Get images
      const { data: images, error: imagesError } = await supabase
        .from("images")
        .select("*")
        .order("taken_on", { ascending: false })
        .range(offset, offset + limit - 1);

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
      const imagesWithAttributions: ImageWithAttributions[] = images.map(
        (img) => ({
          ...img,
          attributions: attributionsByImage[img.id] || [],
        })
      );

      return {
        images: imagesWithAttributions,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
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

  .listen({
    port: parseInt(process.env.PORT || "8080"),
    // hostname: "0.0.0.0",
  });

console.log(
  `🦊 ChirpChirp is running at ${app.server?.hostname}:${app.server?.port}`
);
