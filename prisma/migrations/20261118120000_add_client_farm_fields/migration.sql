-- AlterTable
-- Columnas nullable y sin DEFAULT: los clientes existentes quedan con NULL
-- hasta que se completen sus datos desde la edición.
ALTER TABLE "Client" ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "coffeeTrees" INTEGER,
ADD COLUMN     "farmCoffeeHectares" DECIMAL(10,2),
ADD COLUMN     "farmName" VARCHAR(80),
ADD COLUMN     "farmTotalHectares" DECIMAL(10,2),
ADD COLUMN     "farmVereda" VARCHAR(80);
