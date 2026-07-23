CREATE TABLE `document_processing_usage` (
	`importID` text PRIMARY KEY NOT NULL,
	`ownerID` text NOT NULL,
	`pageCount` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`ownerID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_processing_usage_ownerID_createdAt_idx` ON `document_processing_usage` (`ownerID`,`createdAt`);