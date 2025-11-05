# ChirpChirp Core API Service

A microservice for serving bird watching images and their species attributions with advanced filtering, pagination, and search capabilities.

## Features

- 🖼️ **Image Management** - Fetch images with their species attributions
- 📊 **Pagination** - Efficient pagination for large image collections
- 🔍 **Time Range Filtering** - Filter images by time periods (1 day, 1 week, 1 month, 3 months, 1 year, all)
- 🦅 **Species Filtering** - Filter images by specific bird species
- 📈 **Species Statistics** - Get all species with sighting counts
- ⚡ **Built with Elysia + Bun** - Fast and modern TypeScript framework
- 🗄️ **Supabase Integration** - Seamless database connectivity

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment Variables

Create a `.env` file in the service root directory:

```bash
# Required
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anonymous_key

# Optional
PORT=8080  # Default: 8080
```

### 3. Database Schema

Ensure your Supabase database has the following tables:

#### Images Table

```sql
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_on TIMESTAMP WITH TIME ZONE NOT NULL,
  stored_on TIMESTAMP WITH TIME ZONE DEFAULT now(),
  file_name TEXT,
  local_file_name TEXT,
  image_size INTEGER,
  image_url TEXT NOT NULL,
  download_url TEXT,
  enhanced_image_url TEXT,
  camera_id TEXT,
  camera_name TEXT,
  modem_meid TEXT,
  latitude FLOAT,
  longitude FLOAT,
  is_video BOOLEAN DEFAULT false,
  video_url TEXT,
  user_id UUID,
  is_favorite BOOLEAN DEFAULT false,
  temperature FLOAT,
  moon_phase TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for faster queries
CREATE INDEX idx_images_taken_on ON images(taken_on);
CREATE INDEX idx_images_user_id ON images(user_id);
```

#### Attributions Table

```sql
CREATE TABLE attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL DEFAULT 'speciesnet-ensemble',
  species TEXT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  extra JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(image_id, species, model_version)
);

-- Add indexes for faster queries
CREATE INDEX idx_attributions_image_id ON attributions(image_id);
CREATE INDEX idx_attributions_species ON attributions(species);
CREATE INDEX idx_attributions_confidence ON attributions(confidence);
```

### 4. Run the Service

```bash
bun run dev
```

The service will start on `http://localhost:8080` (or the port specified in `PORT` environment variable).

## API Endpoints

### Health Check

```bash
GET /
```

**Response:**

```json
{
  "status": "ok",
  "service": "core-api-service"
}
```

### Get Images with Attributions (Paginated)

```bash
GET /images?page=1&limit=20&timeRange=7D&species=Blue%20Jay
```

**Query Parameters:**

| Parameter   | Type   | Default | Description                                             |
| ----------- | ------ | ------- | ------------------------------------------------------- |
| `page`      | number | `1`     | Page number (1-indexed)                                 |
| `limit`     | number | `20`    | Number of images per page                               |
| `timeRange` | string | `All`   | Time range filter: `1D`, `7D`, `1M`, `3M`, `1YR`, `All` |
| `species`   | string | -       | Filter by species name (e.g., `Blue Jay`)               |

**Response:**

```json
{
  "images": [
    {
      "id": "uuid",
      "taken_on": "2024-01-15T10:30:00Z",
      "image_url": "https://...",
      "attributions": [
        {
          "image_id": "uuid",
          "model_version": "speciesnet-ensemble",
          "species": "Blue Jay",
          "confidence": 0.95,
          "extra": {}
        }
      ]
      // ... other image fields
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  },
  "filters": {
    "timeRange": "7D",
    "species": "Blue Jay"
  }
}
```

**Notes:**

- Only returns images that have at least one attribution with a valid species
- If `species` filter is provided, only returns images with matching attributions
- Images are sorted by `taken_on` in descending order (newest first)

### Get Specific Image with Attributions

```bash
GET /images/:id
```

**Response:**

```json
{
  "id": "uuid",
  "taken_on": "2024-01-15T10:30:00Z",
  "image_url": "https://...",
  "attributions": [
    {
      "image_id": "uuid",
      "model_version": "speciesnet-ensemble",
      "species": "Blue Jay",
      "confidence": 0.95,
      "extra": {}
    }
  ]
  // ... other image fields
}
```

**Error Response (404):**

```json
{
  "error": "Image not found",
  "status": 404
}
```

### Get Attributions for Specific Image

```bash
GET /images/:id/attributions
```

**Response:**

```json
{
  "image_id": "uuid",
  "attributions": [
    {
      "image_id": "uuid",
      "model_version": "speciesnet-ensemble",
      "species": "Blue Jay",
      "confidence": 0.95,
      "extra": {}
    }
  ]
}
```

**Notes:**

- Attributions are sorted by confidence in descending order (highest first)

### Get All Species with Counts

```bash
GET /species
```

**Response:**

```json
{
  "species": [
    {
      "species": "Blue Jay",
      "count": 45
    },
    {
      "species": "Cardinal",
      "count": 32
    },
    {
      "species": "Robin",
      "count": 28
    }
  ]
}
```

**Notes:**

- Species are sorted by count in descending order (most common first)
- Only includes species from attributions with valid, non-empty species names

## Integration with Other Services

### From External Media Service

After images are uploaded and processed, they can be queried through this service:

```typescript
// After image upload
const response = await fetch("http://core-api-service:8080/images", {
  method: "GET",
  headers: { "Content-Type": "application/json" },
});

const { images, pagination } = await response.json();
```

### From Media Attribution Service

After attributions are created, they are automatically available through this API:

```typescript
// After attribution is created
const response = await fetch(
  `http://core-api-service:8080/images/${imageId}/attributions`,
  {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  }
);

const { attributions } = await response.json();
```

### From Email Service

When sending daily summaries, fetch recent images:

```typescript
// Get images from last 24 hours
const response = await fetch(
  "http://core-api-service:8080/images?timeRange=1D&limit=50",
  {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  }
);

const { images } = await response.json();
```

## Architecture

```
core-api-service/
├── src/
│   └── index.ts              # Main Elysia app with API routes
├── Dockerfile                 # Docker configuration
├── package.json              # Dependencies and scripts
└── README.md                 # This file
```

### Data Flow

1. **Request** → API receives HTTP request with query parameters
2. **Query** → Fetches images from Supabase with filters
3. **Join** → Fetches attributions for returned images
4. **Filter** → Filters images by attribution requirements
5. **Transform** → Combines images with their attributions
6. **Response** → Returns paginated, filtered results

## Technology Stack

- **Runtime**: Bun
- **Framework**: Elysia
- **Database**: Supabase (PostgreSQL)
- **Language**: TypeScript

## Docker Deployment

### Build Docker Image

```bash
bun run docker:build
```

Or manually:

```bash
docker build -t core-api-service .
```

### Run Docker Container

```bash
bun run docker:run
```

Or manually:

```bash
docker run -p 8080:8080 --env-file .env --name core-api-service core-api-service
```

### Stop Docker Container

```bash
bun run docker:stop
```

Or manually:

```bash
docker stop core-api-service && docker rm core-api-service
```

### Test Docker Build and Run

```bash
bun run docker:test
```

## Development

### Development Mode

```bash
bun run dev
```

This runs the service with hot-reload enabled (watches for file changes).

### Production Mode

```bash
bun run src/index.ts
```

## Troubleshooting

### Connection errors to Supabase

**Error**: `Failed to fetch from Supabase`

**Solutions:**

- Check that `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set correctly
- Verify your Supabase project is active
- Check network connectivity
- Verify Supabase RLS (Row Level Security) policies allow access

### Empty results

**Issue**: No images returned even though images exist in database

**Solutions:**

- Check that images have associated attributions with valid species
- Verify the `species` filter matches exactly (case-sensitive)
- Check time range filter is correct
- Ensure images have `taken_on` timestamps set

### Slow queries

**Issue**: API responses are slow

**Solutions:**

- Add indexes on frequently queried columns (see database schema)
- Reduce `limit` parameter for pagination
- Use more specific time range filters
- Check Supabase query performance
- Consider caching frequently accessed data

### Port already in use

**Error**: `Port 8080 is already in use`

**Solutions:**

- Change `PORT` environment variable to a different port
- Stop the process using port 8080
- Use `lsof -i :8080` to find the process and kill it

## Production Deployment

1. **Set environment variables** in your hosting platform
2. **Build Docker image** or deploy directly with Bun
3. **Configure port** (default: 8080, but platforms like Google Cloud Run use PORT env var)
4. **Set up health checks** using the `/` endpoint
5. **Configure monitoring** for error tracking and performance
6. **Set up logging** to track API usage
7. **Configure CORS** if needed for frontend access
8. **Set up rate limiting** to prevent abuse

### Google Cloud Run

The Dockerfile is configured for Google Cloud Run:

- Uses `PORT` environment variable (automatically set by Cloud Run)
- Runs as non-root user for security
- Production-ready build

## License

MIT
