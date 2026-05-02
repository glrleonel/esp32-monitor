const JSZip = require("jszip");

function getBrazilDayRange(date) {
  const start = new Date(`${date}T00:00:00-03:00`);
  const end = new Date(`${date}T23:59:59.999-03:00`);

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

module.exports = async function handler(req, res) {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        ok: false,
        error: "missing_date"
      });
    }

    const { start, end } = getBrazilDayRange(date);

    const photosResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/photo_uploads?uploaded_at=gte.${start}&uploaded_at=lte.${end}&order=uploaded_at.asc`,
      {
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    const photos = await photosResponse.json();

    if (!photos || photos.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "no_photos_found",
        date,
        start,
        end
      });
    }

    const zip = new JSZip();

    for (const photo of photos) {
      const encodedPath = photo.storage_path
        .split("/")
        .map(encodeURIComponent)
        .join("/");

      const fileResponse = await fetch(
        `${process.env.SUPABASE_URL}/storage/v1/object/esp32-photos/${encodedPath}`,
        {
          headers: {
            "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );

      if (!fileResponse.ok) continue;

      const arrayBuffer = await fileResponse.arrayBuffer();

      const originalName = photo.storage_path.split("/").pop();
      const safeName = `${photo.id}_${originalName}`;

      zip.file(safeName, Buffer.from(arrayBuffer));
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=fotos_${date}.zip`
    );

    return res.status(200).send(zipBuffer);

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
