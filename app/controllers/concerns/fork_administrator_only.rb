# Telas do fork Goncalves & Silva restritas a administrador (Dashboard IA,
# Relatorio da Equipe) — 09/11/2026. A mesma checagem estava copiada nos dois
# controllers; cada um diz so o nome da tela em `fork_screen_name`.
module ForkAdministratorOnly
  extend ActiveSupport::Concern

  included do
    before_action :ensure_fork_administrator
  end

  private

  def ensure_fork_administrator
    return if Current.account_user&.administrator?

    render json: { error: "Apenas administradores acessam #{fork_screen_name}" }, status: :forbidden
  end

  def fork_screen_name
    'esta tela'
  end
end
