-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
