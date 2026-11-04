require 'rails_helper'

# Dashboard IA (fork Goncalves & Silva) - funcoes puras do historico de etiquetas.
RSpec.describe DashboardIa::HistoryParser do
  describe '.added_labels' do
    it 'le as etiquetas adicionadas em pt_BR e en' do
      expect(described_class.added_labels('Karol adicionou contrato_assinado')).to eq(['contrato_assinado'])
      expect(described_class.added_labels('Maria da Silva adicionou sdr, urgente')).to eq(%w[sdr urgente])
      expect(described_class.added_labels('Admin added bpc_contrato_assinado')).to eq(['bpc_contrato_assinado'])
    end

    it 'ignora texto que nao e etiqueta adicionada' do
      expect(described_class.added_labels('Karol removeu sdr')).to eq([])
      expect(described_class.added_labels('Conversa resolvida por Karol')).to eq([])
      expect(described_class.added_labels(nil)).to eq([])
    end

    it 'descarta frase que nao tem formato de etiqueta (politica de SLA)' do
      expect(described_class.added_labels('Karol adicionou política de SLA X')).to eq([])
      expect(described_class.added_labels('Karol adicionou Sdr')).to eq([])
    end

    it 'aguenta quebra de linha no fim' do
      expect(described_class.added_labels("Karol adicionou sdr\n")).to eq(['sdr'])
    end
  end

  describe '.first_seen' do
    it 'guarda a PRIMEIRA vez de cada etiqueta por conversa' do
      events = [
        [1, 'A adicionou sdr', 300],
        [1, 'A adicionou sdr, comercial', 100],
        [2, 'A removeu sdr', 50],
        [2, 'B added efetivado', 70]
      ]
      expect(described_class.first_seen(events)).to eq(
        1 => { 'sdr' => 100, 'comercial' => 100 },
        2 => { 'efetivado' => 70 }
      )
    end

    it 'devolve hash vazio sem eventos' do
      expect(described_class.first_seen([])).to eq({})
    end
  end

  describe '.ddd' do
    {
      '+5585999990000' => '85',
      '5511987654321' => '11',
      '85999990000' => '85',
      '8532221100' => '85',
      '(85)99999-0000' => '85',
      '+55 85 3222-1100' => '85',
      '+12025550123' => nil,
      '558599' => nil,
      '' => nil
    }.each do |phone, expected|
      it "#{phone.inspect} -> #{expected.inspect}" do
        expect(described_class.ddd(phone)).to eq(expected)
      end
    end

    it 'aceita nil' do
      expect(described_class.ddd(nil)).to be_nil
    end
  end

  describe '.clean_goals' do
    it 'fica so com chave curta em minusculas e inteiro de 1 a 100.000' do
      raw = { 'bpc' => '10', 'Aux' => 5, 'aux' => 0, 'x' => 100_001, 'ok' => 100_000,
              'tudo' => 'abc', '__todos__' => 60, ('a' * 41) => 1 }
      expect(described_class.clean_goals(raw)).to eq('bpc' => 10, 'ok' => 100_000, '__todos__' => 60)
    end

    it 'devolve hash vazio para o que nao e hash' do
      expect(described_class.clean_goals(nil)).to eq({})
      expect(described_class.clean_goals([1, 2])).to eq({})
      expect(described_class.clean_goals('x')).to eq({})
    end
  end
end
