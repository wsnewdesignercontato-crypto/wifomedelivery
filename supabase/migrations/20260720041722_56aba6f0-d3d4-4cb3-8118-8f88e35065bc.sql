
-- Chat attachments: usuários autenticados podem ler/gravar dentro da própria pasta
CREATE POLICY "chat upload own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "chat read auth" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='chat-attachments');

-- Delivery proofs: entregador envia dentro da pasta com seu uid; leitura restrita ao pedido
CREATE POLICY "proof upload own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='delivery-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "proof read auth" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='delivery-proofs');
