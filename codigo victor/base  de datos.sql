-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: colegio_db
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `evidences`
--

DROP TABLE IF EXISTS `evidences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evidences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `description` text,
  `filename` varchar(255) NOT NULL,
  `original_filename` varchar(255) DEFAULT NULL,
  `uploaded_at` datetime NOT NULL,
  `indicator_id` int DEFAULT NULL,
  `plan_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_evidences_id` (`id`),
  KEY `ix_evidences_uploaded_at` (`uploaded_at`),
  KEY `ix_evidences_indicator_id` (`indicator_id`),
  KEY `idx_evidences_plan_id` (`plan_id`),
  CONSTRAINT `evidences_ibfk_1` FOREIGN KEY (`indicator_id`) REFERENCES `indicators` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `evidences`
--

LOCK TABLES `evidences` WRITE;
/*!40000 ALTER TABLE `evidences` DISABLE KEYS */;
INSERT INTO `evidences` VALUES (34,'Aqui yo ingreso mi descripcion de la evidencia','f14e83ce-00fe-4b14-9e71-69644484936a.png','evidencia viewer2 (2) (1).png','2025-10-26 21:08:19',NULL,19),(36,'Aqui ingreso la descripcion de la evidencia pero en otra accion','5cc639af-6f59-4eb2-aee5-57fb2d93b71d.png','evidencia viewer2 (2).png','2025-10-26 21:10:35',NULL,21);
/*!40000 ALTER TABLE `evidences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `evidences_backup`
--

DROP TABLE IF EXISTS `evidences_backup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evidences_backup` (
  `id` int NOT NULL AUTO_INCREMENT,
  `description` text,
  `filename` varchar(255) NOT NULL,
  `original_filename` varchar(255) DEFAULT NULL,
  `uploaded_at` datetime NOT NULL,
  `indicator_id` int NOT NULL,
  `plan_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_evidences_id` (`id`),
  KEY `ix_evidences_uploaded_at` (`uploaded_at`),
  KEY `ix_evidences_indicator_id` (`indicator_id`),
  KEY `idx_evidences_plan_id` (`plan_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `evidences_backup`
--

LOCK TABLES `evidences_backup` WRITE;
/*!40000 ALTER TABLE `evidences_backup` DISABLE KEYS */;
/*!40000 ALTER TABLE `evidences_backup` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `goals`
--

DROP TABLE IF EXISTS `goals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `goals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text,
  `year` int NOT NULL,
  `objective_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_goals_objective_id` (`objective_id`),
  KEY `ix_goals_id` (`id`),
  CONSTRAINT `goals_ibfk_1` FOREIGN KEY (`objective_id`) REFERENCES `objectives` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `goals`
--

LOCK TABLES `goals` WRITE;
/*!40000 ALTER TABLE `goals` DISABLE KEYS */;
INSERT INTO `goals` VALUES (3,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,1),(4,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,3),(5,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,4),(6,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,5),(7,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,6),(9,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,7),(10,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,8),(13,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,9),(14,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,10),(15,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,11),(16,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,12),(17,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,13),(19,'Evidencias del objetivo','Repositorio de evidencias — 2025',2025,14);
/*!40000 ALTER TABLE `goals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `indicators`
--

DROP TABLE IF EXISTS `indicators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `indicators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `target` text,
  `unit` varchar(50) DEFAULT NULL,
  `goal_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_indicators_id` (`id`),
  KEY `ix_indicators_goal_id` (`goal_id`),
  CONSTRAINT `indicators_ibfk_1` FOREIGN KEY (`goal_id`) REFERENCES `goals` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `indicators`
--

LOCK TABLES `indicators` WRITE;
/*!40000 ALTER TABLE `indicators` DISABLE KEYS */;
INSERT INTO `indicators` VALUES (1,'Evidencias',NULL,NULL,3),(2,'Evidencias',NULL,NULL,4),(3,'Evidencias',NULL,NULL,5),(4,'Evidencias',NULL,NULL,6),(5,'Evidencias',NULL,NULL,7),(6,'Evidencias',NULL,NULL,9),(7,'Evidencias',NULL,NULL,10),(8,'Evidencias',NULL,NULL,13),(9,'Evidencias',NULL,NULL,14),(10,'Evidencias',NULL,NULL,15),(11,'Evidencias',NULL,NULL,16),(12,'Evidencias',NULL,NULL,17),(13,'Evidencias',NULL,NULL,19);
/*!40000 ALTER TABLE `indicators` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `objectives`
--

DROP TABLE IF EXISTS `objectives`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `objectives` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `dimension` varchar(64) DEFAULT NULL,
  `description` text,
  `start_year` int NOT NULL,
  `end_year` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_objectives_id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `objectives`
--

LOCK TABLES `objectives` WRITE;
/*!40000 ALTER TABLE `objectives` DISABLE KEYS */;
INSERT INTO `objectives` VALUES (1,'asldksaldklsadassa',NULL,'',2025,2028),(2,'asldksaldklsadassa',NULL,'',2025,2028),(3,'a',NULL,'',2025,2028),(4,'wqeqwwqeqw',NULL,'',2025,2028),(5,'Primer intento de creacion de planes',NULL,'',2025,2028),(6,'Primer intento de creacion de planes','LIDERAZGO','',2025,2028),(7,'hola','GESTION_PEDAGOGICA','',2025,2028),(8,'intento 2','LIDERAZGO','',2025,2028),(9,'intento 3','LIDERAZGO','',2025,2028),(10,'laala','LIDERAZGO','',2025,2028),(11,'plan comer','GESTION_PEDAGOGICA','',2025,2028),(12,'sadsa','LIDERAZGO','',2025,2028),(13,'Intento 1','LIDERAZGO','',2025,2028),(14,'sadsad','GESTION_RECURSOS','',2025,2028);
/*!40000 ALTER TABLE `objectives` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `plan_resources`
--

DROP TABLE IF EXISTS `plan_resources`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `plan_resources` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_id` int NOT NULL,
  `recursos_necesarios` text,
  `ate` varchar(120) DEFAULT NULL,
  `tic` varchar(120) DEFAULT NULL,
  `planes` varchar(255) DEFAULT NULL,
  `medios_verificacion` text,
  `monto_subvencion_general` int DEFAULT NULL,
  `monto_sep` int DEFAULT NULL,
  `monto_pie` int DEFAULT NULL,
  `monto_eib` int DEFAULT NULL,
  `monto_mantenimiento` int DEFAULT NULL,
  `monto_pro_retencion` int DEFAULT NULL,
  `monto_internado` int DEFAULT NULL,
  `monto_reforzamiento` int DEFAULT NULL,
  `monto_faep` int DEFAULT NULL,
  `monto_aporte_municipal` int DEFAULT NULL,
  `monto_total` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_plan_resources_plan_id` (`plan_id`),
  KEY `ix_plan_resources_id` (`id`),
  CONSTRAINT `plan_resources_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `strategic_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plan_resources`
--

LOCK TABLES `plan_resources` WRITE;
/*!40000 ALTER TABLE `plan_resources` DISABLE KEYS */;
INSERT INTO `plan_resources` VALUES (5,19,'se necesitan archivos png','23112','321213','plan1','a',0,0,200000,50000,10000,10000,10000,300000,60000,100000,740000),(7,21,'asdsa','dsadsa','sad','sadas','sadsa',0,0,200000,0,0,0,10000,0,0,0,210000),(8,22,'sadsad','','','','',0,0,0,0,0,0,0,0,0,0,0);
/*!40000 ALTER TABLE `plan_resources` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `strategic_goals`
--

DROP TABLE IF EXISTS `strategic_goals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `strategic_goals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dimension` varchar(64) NOT NULL,
  `objetivo` varchar(512) NOT NULL,
  `plan_id` int NOT NULL,
  `meta_estrategica` varchar(512) NOT NULL,
  `estrategia_periodo` varchar(512) NOT NULL,
  `descripcion_indicador` varchar(1024) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_strategic_goals_plan` (`plan_id`),
  KEY `idx_dimension` (`dimension`),
  KEY `idx_objetivo` (`objetivo`),
  CONSTRAINT `fk_strategic_goals_plan` FOREIGN KEY (`plan_id`) REFERENCES `strategic_plans` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `strategic_goals`
--

LOCK TABLES `strategic_goals` WRITE;
/*!40000 ALTER TABLE `strategic_goals` DISABLE KEYS */;
/*!40000 ALTER TABLE `strategic_goals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `strategic_plans`
--

DROP TABLE IF EXISTS `strategic_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `strategic_plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dimension` varchar(40) NOT NULL,
  `colegio` varchar(200) NOT NULL,
  `objetivo_estrategico` text NOT NULL,
  `estrategia` text NOT NULL,
  `subdimension` varchar(120) DEFAULT NULL,
  `accion` varchar(255) NOT NULL,
  `descripcion` text,
  `fecha_inicio` date NOT NULL,
  `fecha_termino` date NOT NULL,
  `programa_asociado` varchar(255) DEFAULT NULL,
  `responsable` varchar(120) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_strategic_plans_dimension` (`dimension`),
  KEY `ix_strategic_plans_id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `strategic_plans`
--

LOCK TABLES `strategic_plans` WRITE;
/*!40000 ALTER TABLE `strategic_plans` DISABLE KEYS */;
INSERT INTO `strategic_plans` VALUES (19,'LIDERAZGO','Liceo La Asuncion de Talcahuano','Intento 1','Intento 1','prueba 1','intento 1.1','intentar insertar evidencias','2025-10-26','2025-10-27','UNAB','Victor carrasco','2025-10-26 17:05:11'),(21,'LIDERAZGO','Liceo La Asuncion de Talcahuano','Intento 1','Intento 1','sadsada','intento 1.2','intentar ingresar objetvios e imagenes','2025-10-26','2025-10-27','UNAB','Victor carrasco','2025-10-26 17:08:27'),(22,'LIDERAZGO','Liceo La Asuncion de Talcahuano','sadsadas','sadsad','sadsad','sadsad','dsadsa','2025-10-26','2025-10-26','UNAB','Victor carrasco','2025-10-26 18:21:53'),(23,'GESTION_RECURSOS','Liceo La Asuncion de Talcahuano','sadsad','sadsa','sadsa','sdaas','dsadsa','2025-10-26','2025-10-28','','','2025-10-26 18:22:14');
/*!40000 ALTER TABLE `strategic_plans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rut` varchar(12) NOT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(120) NOT NULL,
  `password` char(60) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `role` varchar(20) NOT NULL DEFAULT 'viewer',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (6,'218117813','Carlos','carlos@example.com','$2b$12$p0E8i7ppvQ6Tn3TgM9puNuwZ3RyFU6IVg8SX1X6L7gKFKqoExofZS',1,'2025-10-08 00:58:49','editor'),(7,'123456785','director','director@example.com','$2b$12$p0E8i7ppvQ6Tn3TgM9puNuwZ3RyFU6IVg8SX1X6L7gKFKqoExofZS',1,'2025-10-08 02:05:03','viewer');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-10-26 18:28:34
