CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`boardID` text NOT NULL,
	`ownerID` text NOT NULL,
	`title` text NOT NULL,
	`r2Key` text NOT NULL,
	`pageCount` integer NOT NULL,
	`byteSize` integer NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`failureReason` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ownerID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_boardID_createdAt_idx` ON `documents` (`boardID`,`createdAt`);--> statement-breakpoint
CREATE INDEX `documents_ownerID_createdAt_idx` ON `documents` (`ownerID`,`createdAt`);--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`vectorID` text PRIMARY KEY NOT NULL,
	`documentID` text NOT NULL,
	`pageNumber` integer NOT NULL,
	FOREIGN KEY (`documentID`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_chunks_documentID_idx` ON `document_chunks` (`documentID`);--> statement-breakpoint
CREATE TABLE `document_pages` (
	`documentID` text NOT NULL,
	`pageNumber` integer NOT NULL,
	`imageR2Key` text NOT NULL,
	`extractedText` text DEFAULT '' NOT NULL,
	`width` real NOT NULL,
	`height` real NOT NULL,
	`ocrApplied` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`documentID`, `pageNumber`),
	FOREIGN KEY (`documentID`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_pages_documentID_pageNumber_idx` ON `document_pages` (`documentID`,`pageNumber`);