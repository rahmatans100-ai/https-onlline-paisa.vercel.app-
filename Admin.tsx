import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { 
  ArrowRight, Users, Phone, Smartphone, CheckCircle, XCircle, 
  Key, DollarSign, Wallet, Search, Eye, Megaphone, Plus, Trash2, Bot, Edit2, UserX
} from 'lucide-react';
import AdminAIChat from '@/components/AdminAIChat';
import AdminNotifications from '@/components/AdminNotifications';

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  
  const [balanceAmount, setBalanceAmount] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [addBalanceAmount, setAddBalanceAmount] = useState('');
  const [balanceDescription, setBalanceDescription] = useState('');
  
  // Offer states
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerTitle, setOfferTitle] = useState('');
  const [offerDescription, setOfferDescription] = useState('');
  const [offerImageUrl, setOfferImageUrl] = useState('');
  const [offerPriority, setOfferPriority] = useState('0');
  const [editPhoneDialogOpen, setEditPhoneDialogOpen] = useState(false);
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editPhoneId, setEditPhoneId] = useState<string | null>(null);
  if (!isAdmin) {
    navigate('/dashboard');
    return null;
  }

  // Fetch all users
  const { data: allUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      return data;
    },
  });

  // Fetch seller numbers
  const { data: sellerNumbers } = useQuery({
    queryKey: ['admin-seller-numbers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('seller_numbers')
        .select('*')
        .order('created_at', { ascending: false });
      return data;
    },
  });

  // Fetch recharge requests
  const { data: rechargeRequests } = useQuery({
    queryKey: ['admin-recharge-requests'],
    queryFn: async () => {
      const { data } = await supabase
        .from('recharge_requests')
        .select('*')
        .order('created_at', { ascending: false });
      return data;
    },
  });

  // Fetch all offers
  const { data: offers } = useQuery({
    queryKey: ['admin-offers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('offers')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });
      return data;
    },
  });

  // Fetch user details for dialog
  const { data: userDetails, refetch: refetchUserDetails } = useQuery({
    queryKey: ['admin-user-details', selectedUser?.user_id],
    queryFn: async () => {
      if (!selectedUser) return null;
      
      const [sellerData, transactionData, referralData] = await Promise.all([
        supabase.from('seller_numbers').select('*').eq('user_id', selectedUser.user_id).order('created_at', { ascending: false }),
        supabase.from('transactions').select('*').eq('user_id', selectedUser.user_id).order('created_at', { ascending: false }).limit(10),
        supabase.from('referrals').select('*, referred:referred_id(full_name)').eq('referrer_id', selectedUser.id),
      ]);
      
      return {
        sellerNumbers: sellerData.data || [],
        transactions: transactionData.data || [],
        referrals: referralData.data || [],
      };
    },
    enabled: !!selectedUser,
  });

  // Get user name helper
  const getUserName = (userId: string) => {
    const user = allUsers?.find(u => u.user_id === userId);
    return user?.full_name || 'نامعلوم';
  };

  // Update seller number
  const updateSellerMutation = useMutation({
    mutationFn: async ({ id, status, codeStatus, balance, userId }: { 
      id: string; status?: string; codeStatus?: string; balance?: number; userId?: string 
    }) => {
      const updates: Record<string, unknown> = {};
      if (status) updates.status = status;
      if (codeStatus) updates.code_status = codeStatus;
      if (balance) updates.balance_added = balance;
      
      await supabase.from('seller_numbers').update(updates).eq('id', id);
      
      if (codeStatus === 'approved' && balance && userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('user_id', userId)
          .single();
        
        await supabase
          .from('profiles')
          .update({ balance: (profile?.balance || 0) + balance })
          .eq('user_id', userId);
        
        await supabase.from('transactions').insert({ 
          user_id: userId, 
          type: 'add_balance', 
          amount: balance, 
          status: 'completed', 
          description: 'Seller نمبر کوډ تایید' 
        });
      }
    },
    onSuccess: () => {
      toast.success('تازه شو!');
      queryClient.invalidateQueries({ queryKey: ['admin-seller-numbers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      refetchUserDetails();
    },
  });

  // Update recharge request
  const updateRechargeMutation = useMutation({
    mutationFn: async ({ id, status, userId, amount }: { 
      id: string; status: 'pending' | 'completed' | 'rejected'; userId: string; amount: number 
    }) => {
      await supabase.from('recharge_requests').update({ status }).eq('id', id);
      
      if (status === 'completed') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('user_id', userId)
          .single();
        
        await supabase
          .from('profiles')
          .update({ balance: (profile?.balance || 0) - amount })
          .eq('user_id', userId);
        
        await supabase.from('transactions').insert({ 
          user_id: userId, 
          type: 'recharge', 
          amount, 
          status: 'completed' 
        });
      }
    },
    onSuccess: () => {
      toast.success('تازه شو!');
      queryClient.invalidateQueries({ queryKey: ['admin-recharge-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  // Add balance to user
  const addBalanceMutation = useMutation({
    mutationFn: async ({ userId, amount, description }: { 
      userId: string; amount: number; description: string 
    }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('user_id', userId)
        .single();
      
      await supabase
        .from('profiles')
        .update({ balance: (profile?.balance || 0) + amount })
        .eq('user_id', userId);
      
      await supabase.from('transactions').insert({ 
        user_id: userId, 
        type: 'add_balance', 
        amount, 
        status: 'completed', 
        description: description || 'اډمین لخوا بیلانس اضافه' 
      });
    },
    onSuccess: () => {
      toast.success('بیلانس اضافه شو!');
      setAddBalanceAmount('');
      setBalanceDescription('');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      refetchUserDetails();
    },
  });

  const handleAddBalance = () => {
    if (!selectedUser || !addBalanceAmount) {
      toast.error('مقدار ولیکئ');
      return;
    }
    addBalanceMutation.mutate({
      userId: selectedUser.user_id,
      amount: parseFloat(addBalanceAmount),
      description: balanceDescription,
    });
  };

  const openUserDialog = (user: any) => {
    setSelectedUser(user);
    setUserDialogOpen(true);
  };

  // Create offer mutation
  const createOfferMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('offers').insert({
        title: offerTitle,
        description: offerDescription || null,
        image_url: offerImageUrl || null,
        priority: parseInt(offerPriority) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('وړاندیز اضافه شو!');
      setOfferDialogOpen(false);
      setOfferTitle('');
      setOfferDescription('');
      setOfferImageUrl('');
      setOfferPriority('0');
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
    },
    onError: () => {
      toast.error('تېروتنه وشوه');
    },
  });

  // Toggle offer status mutation
  const toggleOfferMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await supabase.from('offers').update({ is_active: isActive }).eq('id', id);
    },
    onSuccess: () => {
      toast.success('تازه شو!');
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
    },
  });

  // Delete offer mutation
  const deleteOfferMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('offers').delete().eq('id', id);
    },
    onSuccess: () => {
      toast.success('وړاندیز حذف شو!');
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
    },
  });

  // Delete user mutation (deletes profile and related data)
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Delete related data first
      await supabase.from('seller_numbers').delete().eq('user_id', userId);
      await supabase.from('recharge_requests').delete().eq('user_id', userId);
      await supabase.from('transactions').delete().eq('user_id', userId);
      await supabase.from('user_roles').delete().eq('user_id', userId);
      
      // Delete profile
      const { error } = await supabase.from('profiles').delete().eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('کاروونکی حذف شو!');
      setUserDialogOpen(false);
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: () => {
      toast.error('تېروتنه وشوه');
    },
  });

  // Update seller phone number
  const updatePhoneMutation = useMutation({
    mutationFn: async ({ id, phone }: { id: string; phone: string }) => {
      await supabase.from('seller_numbers').update({ phone_number: phone }).eq('id', id);
    },
    onSuccess: () => {
      toast.success('نمبر تازه شو!');
      setEditPhoneDialogOpen(false);
      setEditPhoneNumber('');
      setEditPhoneId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-seller-numbers'] });
      refetchUserDetails();
    },
    onError: () => {
      toast.error('تېروتنه وشوه');
    },
  });

  // Delete seller number
  const deleteSellerMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('seller_numbers').delete().eq('id', id);
    },
    onSuccess: () => {
      toast.success('نمبر حذف شو!');
      queryClient.invalidateQueries({ queryKey: ['admin-seller-numbers'] });
      refetchUserDetails();
    },
  });

  const openEditPhoneDialog = (id: string, phone: string) => {
    setEditPhoneId(id);
    setEditPhoneNumber(phone);
    setEditPhoneDialogOpen(true);
  };

  const filteredUsers = allUsers?.filter(user => 
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.referral_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      {/* User Detail Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              {selectedUser?.full_name}
            </DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-4">
              {/* User Info */}
              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">بیلانس:</span>
                      <p className="font-bold text-lg text-success">{selectedUser.balance} افغانی</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Referral کوډ:</span>
                      <p className="font-bold">{selectedUser.referral_code}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Add Balance */}
              <Card className="border-primary">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="w-4 h-4" />
                    بیلانس اضافه کول
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="مقدار"
                      value={addBalanceAmount}
                      onChange={(e) => setAddBalanceAmount(e.target.value)}
                      className="text-right"
                    />
                    <Button
                      onClick={handleAddBalance}
                      className="gradient-success shrink-0"
                      disabled={addBalanceMutation.isPending}
                    >
                      <DollarSign className="w-4 h-4" />
                    </Button>
                  </div>
                  <Input
                    placeholder="توضیحات (اختیاري)"
                    value={balanceDescription}
                    onChange={(e) => setBalanceDescription(e.target.value)}
                    className="text-right"
                  />
                </CardContent>
              </Card>

              {/* User's Seller Numbers */}
              {userDetails?.sellerNumbers && userDetails.sellerNumbers.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Seller نمبرونه</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {userDetails.sellerNumbers.map((item: any) => (
                      <div key={item.id} className="p-2 rounded-lg bg-muted text-sm">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{item.phone_number}</span>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditPhoneDialog(item.id, item.phone_number)}>
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteSellerMutation.mutate(item.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                          <span className={
                            item.status === 'approved' ? 'text-success' : 
                            item.status === 'rejected' ? 'text-destructive' : 'text-warning'
                          }>{item.status}</span>
                        </div>
                        <div className="flex justify-between mt-1">
                          <span>کوډ: {item.code || '---'}</span>
                          <span>{item.code_status}</span>
                        </div>
                        {item.status === 'pending' && (
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" className="gradient-success flex-1" onClick={() => updateSellerMutation.mutate({ id: item.id, status: 'approved' })}>
                              <CheckCircle className="w-3 h-3 ml-1" />تایید
                            </Button>
                            <Button size="sm" variant="destructive" className="flex-1" onClick={() => updateSellerMutation.mutate({ id: item.id, status: 'rejected' })}>
                              <XCircle className="w-3 h-3 ml-1" />رد
                            </Button>
                          </div>
                        )}
                        {item.status === 'approved' && item.code_status === 'pending' && !item.code && (
                          <Button size="sm" className="w-full mt-2 gradient-secondary" onClick={() => updateSellerMutation.mutate({ id: item.id, codeStatus: 'can_enter' })}>
                            <Key className="w-3 h-3 ml-1" />کوډ اجازه
                          </Button>
                        )}
                        {item.code && item.code_status === 'pending' && (
                          <div className="flex gap-2 mt-2">
                            <Input
                              type="number"
                              placeholder="بیلانس"
                              value={balanceAmount}
                              onChange={(e) => setBalanceAmount(e.target.value)}
                              className="w-20"
                            />
                            <Button size="sm" className="gradient-success flex-1" onClick={() => {
                              updateSellerMutation.mutate({ 
                                id: item.id, 
                                codeStatus: 'approved', 
                                balance: parseFloat(balanceAmount), 
                                userId: item.user_id 
                              });
                              setBalanceAmount('');
                            }}>
                              <CheckCircle className="w-3 h-3 ml-1" />کوډ تایید
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Recent Transactions */}
              {userDetails?.transactions && userDetails.transactions.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">وروستي معاملې</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {userDetails.transactions.slice(0, 5).map((t: any) => (
                      <div key={t.id} className="flex justify-between text-sm p-2 bg-muted rounded">
                        <span>{t.type === 'add_balance' ? 'اضافه' : t.type === 'recharge' ? 'ریچارج' : 'بونس'}</span>
                        <span className={t.type === 'recharge' ? 'text-destructive' : 'text-success'}>
                          {t.type === 'recharge' ? '-' : '+'}{t.amount}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Referrals */}
              {userDetails?.referrals && userDetails.referrals.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">راجع شوي ({userDetails.referrals.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {userDetails.referrals.map((r: any) => (
                      <div key={r.id} className="flex justify-between text-sm p-2 bg-muted rounded">
                        <span>{r.referred?.full_name}</span>
                        <span className="text-success">+{r.bonus_amount} افغانی</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Delete User Button */}
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  if (confirm('ایا ډاډه یاست چې دا کاروونکی حذف کړئ؟')) {
                    deleteUserMutation.mutate(selectedUser.user_id);
                  }
                }}
                disabled={deleteUserMutation.isPending}
              >
                <UserX className="w-4 h-4 ml-2" />
                {deleteUserMutation.isPending ? 'انتظار...' : 'کاروونکی حذف کړئ'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Phone Number Dialog */}
      <Dialog open={editPhoneDialogOpen} onOpenChange={setEditPhoneDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-primary" />
              نمبر اېډیټ کړئ
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={editPhoneNumber}
              onChange={(e) => setEditPhoneNumber(e.target.value)}
              placeholder="نوی نمبر"
              className="text-right"
            />
            <Button
              className="w-full gradient-primary"
              onClick={() => {
                if (editPhoneId && editPhoneNumber) {
                  updatePhoneMutation.mutate({ id: editPhoneId, phone: editPhoneNumber });
                }
              }}
              disabled={updatePhoneMutation.isPending}
            >
              {updatePhoneMutation.isPending ? 'انتظار...' : 'تازه کړئ'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="gradient-primary p-6 rounded-b-[2rem]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="text-white hover:bg-white/20">
              <ArrowRight className="w-6 h-6" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">اډمین پینل</h1>
              <p className="text-white/70 text-sm">د سیستم بشپړ مدیریت</p>
            </div>
          </div>
          <AdminNotifications />
        </div>
      </div>

      <div className="p-4">
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="w-full mb-4 grid grid-cols-5">
            <TabsTrigger value="users"><Users className="w-4 h-4 ml-1" />کارکوونکي</TabsTrigger>
            <TabsTrigger value="sellers"><Phone className="w-4 h-4 ml-1" />Seller</TabsTrigger>
            <TabsTrigger value="recharge"><Smartphone className="w-4 h-4 ml-1" />ریچارج</TabsTrigger>
            <TabsTrigger value="offers"><Megaphone className="w-4 h-4 ml-1" />وړاندیزونه</TabsTrigger>
            <TabsTrigger value="ai"><Bot className="w-4 h-4 ml-1" />AI</TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="لټون... (نوم یا کوډ)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <Card className="text-center p-3">
                <p className="text-2xl font-bold text-primary">{allUsers?.length || 0}</p>
                <p className="text-xs text-muted-foreground">ټول کارکوونکي</p>
              </Card>
              <Card className="text-center p-3">
                <p className="text-2xl font-bold text-success">
                  {allUsers?.reduce((sum, u) => sum + Number(u.balance), 0) || 0}
                </p>
                <p className="text-xs text-muted-foreground">ټول بیلانس</p>
              </Card>
              <Card className="text-center p-3">
                <p className="text-2xl font-bold text-secondary">{sellerNumbers?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Seller نمبرونه</p>
              </Card>
            </div>

            {/* Users List */}
            {filteredUsers?.map((user) => (
              <Card key={user.id} className="card-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold">{user.full_name || 'نامعلوم'}</p>
                        <p className="text-xs text-muted-foreground">{user.referral_code}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-left">
                        <p className="font-bold text-success">{user.balance} افغانی</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => openUserDialog(user)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Seller Numbers Tab */}
          <TabsContent value="sellers" className="space-y-4">
            {sellerNumbers?.map((item: any) => (
              <Card key={item.id} className="card-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between">
                    <div>
                      <p className="font-bold">{getUserName(item.user_id)}</p>
                      <p className="text-lg">{item.phone_number}</p>
                      <p className="text-sm text-muted-foreground">کوډ: {item.code || '---'}</p>
                    </div>
                    <div className="text-left text-sm">
                      <p className={item.status === 'approved' ? 'text-success' : item.status === 'rejected' ? 'text-destructive' : 'text-warning'}>
                        {item.status === 'approved' ? 'تایید' : item.status === 'rejected' ? 'رد' : 'انتظار'}
                      </p>
                      <p className={item.code_status === 'approved' ? 'text-success' : item.code_status === 'can_enter' ? 'text-primary' : 'text-muted-foreground'}>
                        {item.code_status === 'approved' ? 'کوډ تایید' : item.code_status === 'can_enter' ? 'کوډ فعال' : 'کوډ انتظار'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.status === 'pending' && (
                      <>
                        <Button size="sm" className="gradient-success" onClick={() => updateSellerMutation.mutate({ id: item.id, status: 'approved' })}>
                          <CheckCircle className="w-4 h-4 ml-1" />تایید
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => updateSellerMutation.mutate({ id: item.id, status: 'rejected' })}>
                          <XCircle className="w-4 h-4 ml-1" />رد
                        </Button>
                      </>
                    )}
                    {item.status === 'approved' && item.code_status === 'pending' && !item.code && (
                      <Button size="sm" className="gradient-secondary" onClick={() => updateSellerMutation.mutate({ id: item.id, codeStatus: 'can_enter' })}>
                        <Key className="w-4 h-4 ml-1" />کوډ اجازه
                      </Button>
                    )}
                    {item.code && item.code_status === 'pending' && (
                      <div className="flex gap-2 w-full">
                        <Input 
                          placeholder="بیلانس" 
                          value={balanceAmount} 
                          onChange={(e) => setBalanceAmount(e.target.value)} 
                          className="w-24" 
                          type="number"
                        />
                        <Button size="sm" className="gradient-success" onClick={() => { 
                          updateSellerMutation.mutate({ 
                            id: item.id, 
                            codeStatus: 'approved', 
                            balance: parseFloat(balanceAmount), 
                            userId: item.user_id 
                          }); 
                          setBalanceAmount(''); 
                        }}>
                          <CheckCircle className="w-4 h-4 ml-1" />کوډ تایید
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!sellerNumbers || sellerNumbers.length === 0) && (
              <Card className="text-center py-8">
                <p className="text-muted-foreground">کوم Seller نمبر نشته</p>
              </Card>
            )}
          </TabsContent>

          {/* Recharge Tab */}
          <TabsContent value="recharge" className="space-y-4">
            {rechargeRequests?.map((item: any) => (
              <Card key={item.id} className="card-shadow">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold">{getUserName(item.user_id)}</p>
                      <p>{item.phone_number}</p>
                      <p className="text-lg font-bold text-secondary">{item.amount} افغانی</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={
                        item.status === 'completed' ? 'text-success' : 
                        item.status === 'rejected' ? 'text-destructive' : 'text-warning'
                      }>
                        {item.status === 'completed' ? 'بشپړ' : item.status === 'rejected' ? 'رد' : 'انتظار'}
                      </span>
                      {item.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button size="sm" className="gradient-success" onClick={() => updateRechargeMutation.mutate({ id: item.id, status: 'completed', userId: item.user_id, amount: item.amount })}>
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => updateRechargeMutation.mutate({ id: item.id, status: 'rejected', userId: item.user_id, amount: item.amount })}>
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!rechargeRequests || rechargeRequests.length === 0) && (
              <Card className="text-center py-8">
                <p className="text-muted-foreground">کومه غوښتنه نشته</p>
              </Card>
            )}
          </TabsContent>

          {/* Offers Tab */}
          <TabsContent value="offers" className="space-y-4">
            <Button 
              className="w-full gradient-warm" 
              onClick={() => setOfferDialogOpen(true)}
            >
              <Plus className="w-4 h-4 ml-2" />
              نوی وړاندیز اضافه کړئ
            </Button>

            {offers?.map((offer: any) => (
              <Card key={offer.id} className="card-shadow">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Megaphone className="w-4 h-4 text-primary" />
                        <h4 className="font-bold">{offer.title}</h4>
                      </div>
                      {offer.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {offer.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        اولویت: {offer.priority}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">فعال</Label>
                        <Switch
                          checked={offer.is_active}
                          onCheckedChange={(checked) => 
                            toggleOfferMutation.mutate({ id: offer.id, isActive: checked })
                          }
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteOfferMutation.mutate(offer.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {(!offers || offers.length === 0) && (
              <Card className="text-center py-8">
                <p className="text-muted-foreground">کوم وړاندیز نشته</p>
              </Card>
            )}
          </TabsContent>

          {/* AI Support Tab */}
          <TabsContent value="ai">
            <AdminAIChat />
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Offer Dialog */}
      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" />
              نوی وړاندیز
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>سرلیک *</Label>
              <Input
                placeholder="د وړاندیز سرلیک"
                value={offerTitle}
                onChange={(e) => setOfferTitle(e.target.value)}
                className="text-right mt-1"
              />
            </div>
            <div>
              <Label>توضیحات</Label>
              <Textarea
                placeholder="د وړاندیز توضیحات"
                value={offerDescription}
                onChange={(e) => setOfferDescription(e.target.value)}
                className="text-right mt-1"
                rows={3}
              />
            </div>
            <div>
              <Label>عکس URL</Label>
              <Input
                placeholder="https://..."
                value={offerImageUrl}
                onChange={(e) => setOfferImageUrl(e.target.value)}
                className="mt-1"
                dir="ltr"
              />
            </div>
            <div>
              <Label>اولویت (لوړه شمېره = پورته)</Label>
              <Input
                type="number"
                placeholder="0"
                value={offerPriority}
                onChange={(e) => setOfferPriority(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button
              className="w-full gradient-primary"
              onClick={() => createOfferMutation.mutate()}
              disabled={!offerTitle || createOfferMutation.isPending}
            >
              {createOfferMutation.isPending ? 'انتظار...' : 'اضافه کړئ'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
