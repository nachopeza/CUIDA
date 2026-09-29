-- Dónde vive la persona, en dos niveles: la dirección exacta para quien tiene
-- el servicio, el municipio y la zona para quien está decidiendo si le encaja.
ALTER TABLE "personas" ADD COLUMN "municipio" TEXT;
ALTER TABLE "personas" ADD COLUMN "comunidad" TEXT;
ALTER TABLE "personas" ADD COLUMN "zona" TEXT;
