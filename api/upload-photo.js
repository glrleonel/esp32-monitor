function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function cleanPath(value) {
  return String(value || "")
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9_\-./]/g, "_");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const body = await readRawBody(req);

    if (!body || body.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "empty_file"
      });
    }

    const deviceId = req.headers["x-device-id"] || "esp32_cam_ufsj_01";
    const localPath = req.headers["x-local-path"] || "";
    const capturedAt = req.headers["x-captured-at"] || null;

    const fallbackName = `photo_${Date.now()}.jpg`;
    const fileName =
      cleanPath(localPath).split("/").filter(Boolean).pop() || fallbackName;

    const dateFolder = new Date().toISOString().slice(0, 10);

    const storagePath = cleanPath(
      `${deviceId}/${dateFolder}/${fileName}`
    );

    const encodedPath = storagePath
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const uploadResponse = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/esp32-photos/${encodedPath}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "image/jpeg",
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "x-upsert": "true"
        },
        body
      }
    );

    const uploadText = await uploadResponse.text();

    if (!uploadResponse.ok) {
      return res.status(500).json({
        ok: false,
        error: "storage_upload_failed",
        detail: uploadText
      });
    }

    const insertPayload = {
      device_id: deviceId,
      local_path: localPath || null,
      storage_path: storagePath,
      file_size: body.length,
      upload_status: "uploaded",
      let safeCapturedAt = null;

if (capturedAt && !capturedAt.startsWith("teste_") && !capturedAt.startsWith("sem_hora")) {
  const parsedDate = new Date(capturedAt.replace(" ", "T"));
  if (!isNaN(parsedDate.getTime())) {
    safeCapturedAt = parsedDate.toISOString();
  }
}
    };

    const dbResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/photo_uploads`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Prefer": "return=representation"
        },
        body: JSON.stringify(insertPayload)
      }
    );

    const dbText = await dbResponse.text();

    if (!dbResponse.ok) {
      return res.status(500).json({
        ok: false,
        error: "photo_metadata_insert_failed",
        detail: dbText,
        storage_path: storagePath
      });
    }

    return res.status(200).json({
      ok: true,
      uploaded: true,
      storage_path: storagePath,
      file_size: body.length,
      result: JSON.parse(dbText)
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
