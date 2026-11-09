# Configuracoes do fork Goncalves & Silva guardadas em accounts.custom_attributes
# (metas do Dashboard IA, usuarios IA do Relatorio da Equipe) — 09/11/2026.
#
# Antes cada controller lia o JSON, juntava e gravava de volta: dois
# administradores salvando ao mesmo tempo, ou as duas telas, perdiam a
# alteracao do outro. Aqui a escrita trava a linha da conta (with_lock rele o
# registro) e so entao junta a chave nova ao que esta gravado.
module AccountSettingsStore
  module_function

  def read(account, key)
    (account.custom_attributes || {})[key]
  end

  # Grava em `key` o que o bloco devolver; o bloco recebe o valor atual, ja
  # relido sob a trava. Devolve o valor gravado.
  def write(account, key)
    account.with_lock do
      current = account.custom_attributes || {}
      value = yield(current[key])
      account.update!(custom_attributes: current.merge(key => value))
      value
    end
  end
end
