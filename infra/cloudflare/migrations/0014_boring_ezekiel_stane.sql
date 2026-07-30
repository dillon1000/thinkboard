CREATE TABLE `lectures` (
	`id` text PRIMARY KEY NOT NULL,
	`boardID` text NOT NULL,
	`ownerID` text NOT NULL,
	`title` text NOT NULL,
	`r2Key` text NOT NULL,
	`mediaType` text NOT NULL,
	`byteSize` integer NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`segments` text NOT NULL,
	`durationSeconds` real,
	`failureReason` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`boardID`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ownerID`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lectures_boardID_createdAt_idx` ON `lectures` (`boardID`,`createdAt`);--> statement-breakpoint
CREATE INDEX `lectures_ownerID_createdAt_idx` ON `lectures` (`ownerID`,`createdAt`);--> statement-breakpoint
CREATE TABLE `lecture_chunks` (
	`vectorID` text PRIMARY KEY NOT NULL,
	`lectureID` text NOT NULL,
	`startSecond` real NOT NULL,
	`endSecond` real NOT NULL,
	FOREIGN KEY (`lectureID`) REFERENCES `lectures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lecture_chunks_lectureID_idx` ON `lecture_chunks` (`lectureID`);